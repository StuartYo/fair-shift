import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "../eval/cases";
import fixtures from "../fixtures/official-pages.json";
import { DocStore } from "../lib/agent/citations";
import { MockProvider } from "../lib/llm/mock";
import { FixtureSearchProvider, type FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { hasSimplified, reasons, templateExplanation } from "../lib/wage/explain";
import { parseScheduleDetailed } from "../lib/wage/parse";
import { redact } from "../lib/wage/redact";
import { runFairShift } from "../lib/wage/run";
import { verifyHoliday } from "../lib/wage/verify";
import type { CheckInput } from "../lib/wage/types";

// Fixes from the first review round. Synthetic data only.

const run = (input: CheckInput) =>
  runFairShift(input, {
    llm: new MockProvider(rulesMockScript()),
    search: new FixtureSearchProvider(fixtures as FixtureSet),
    mode: "mock",
    modeNote: "test",
    today: "2026-10-14",
  });

describe("messy schedules", () => {
  it("places weekday-only lines inside the pay period and reads 休1小時 as a break", () => {
    const p = parseScheduleDetailed("週五 18-22\n週六 12-20 休1小時", 2026, { start: "2026-10-19", end: "2026-10-25" });
    expect(p.shifts.map((s) => [s.date, s.start, s.end, s.breakMinutes])).toEqual([
      ["2026-10-23", "18:00", "22:00", 0],
      ["2026-10-24", "12:00", "20:00", 60],
    ]);
    expect(p.unread).toEqual([]);
  });

  it("never guesses a weekday when the period has two of them, and reports the line", () => {
    const p = parseScheduleDetailed("週五 18-22", 2026, { start: "2026-10-01", end: "2026-10-15" });
    expect(p.shifts).toEqual([]);
    expect(p.unread).toEqual([{ line: "週五 18-22", reason: "weekday_ambiguous" }]);
  });

  it("reads full-width digits", () => {
    const p = parseScheduleDetailed("１０／２９（四）　１７：００～２２：３０", 2026);
    expect(p.shifts[0]).toMatchObject({ date: "2026-10-29", start: "17:00", end: "22:30" });
  });

  it("says plainly when no shift can be read, instead of showing NT$0", async () => {
    const r = await run({ jurisdiction: "TW", scheduleText: "週五 18-22\n週六 12-20 休1小時", payslipText: "時薪 200" });
    expect(r.shifts).toEqual([]);
    expect(r.parseError?.part).toBe("schedule");
    expect(r.parseError?.zh).toContain("問題在「班表」");
    expect(r.parseError?.en).toContain("schedule box");
    expect(r.parseError?.unread).toEqual(["週五 18-22", "週六 12-20 休1小時"]);
    expect(r.trace.some((t) => t.name === "no_shifts")).toBe(true);
  });
});

describe("privacy", () => {
  it("removes unlabeled names, shops, landlines, tax IDs, accounts and handles", () => {
    const r = redact("王小明 0912-345-678 A123456789、員工姓名：王小明、帳號 123456789012\n全家北屯店 店長：林大華 04-2284-0832 統編 12345678 @阿明");
    for (const leak of ["王小明", "林大華", "全家北屯店", "0912", "04-2284", "12345678", "123456789012", "阿明", "A123456789"]) expect(r.text).not.toContain(leak);
  });

  it("keeps the schedule itself intact", () => {
    const text = "週五 18-22\n周六 12-20 休1小時\n10/10(六) 國定假日 10:00~16:00\n時薪 196 實發金額：4,312\n2026/10/19-2026/10/25";
    expect(redact(text)).toEqual({ text, count: 0 });
    for (const c of EVAL_CASES) {
      // Redaction may remove a manager's name, never a shift or a payslip number.
      const shifts = (t: string) => parseScheduleDetailed(t, 2026, { start: "2026-10-19", end: "2026-10-25" }).shifts.map(({ raw: _raw, ...s }) => s);
      expect(shifts(redact(c.input.scheduleText).text), c.id).toEqual(shifts(c.input.scheduleText));
      expect(redact(c.input.payslipText).count, c.id).toBe(0);
    }
    expect(redact("店長：下週班表喔～").text).toBe("店長: [NAME]");
  });
});

describe("agent checks", () => {
  const docs = () => {
    const s = new DocStore();
    for (const d of (fixtures as FixtureSet).docs) s.add({ ...d, via: "fixture_extract", retrievedAt: "" });
    return s;
  };
  const DGPA = "https://www.dgpa.gov.tw/information?uid=30&pid=12573";

  it("accepts the day-off clause header plus the numbered item as two quotes", () => {
    const v = verifyHoliday(
      {
        month_day: "10-10",
        name: "國慶日",
        citations: [
          { source_url: DGPA, quote: "十五、國慶日：十月十日。" },
          { source_url: DGPA, quote: "下列紀念日均放假一日，其餘均不放假：" },
          { source_url: DGPA, quote: "四、國慶日。" },
        ],
      },
      docs(),
      "agent",
    );
    expect(v.ok).toBe(true);
  });

  it("rejects an item that is not listed under a day-off clause", () => {
    const v = verifyHoliday(
      {
        month_day: "03-12",
        name: "植樹節",
        citations: [
          { source_url: DGPA, quote: "六、植樹節：三月十二日。" },
          { source_url: DGPA, quote: "下列紀念日均放假一日，其餘均不放假：" },
        ],
      },
      docs(),
      "agent",
    );
    expect(v.ok).toBe(false);
  });

  it("tells the model which page a quote is really on", () => {
    const r = docs().verify("https://www.mol.gov.tw/1607/1632/1633/99195/post", "訂定每月最低工資為29,500元，每小時最低工資為196元。");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/");
  });
});

describe("result page content", () => {
  it("explains the hero sample with the date, hours, article and amount, in Traditional Chinese, without rule codes", async () => {
    const c = EVAL_CASES.find((x) => x.id === "tw-holiday-unpaid")!;
    const r = await run(c.input);
    const rs = reasons(r.computation, r.shifts, r.rules);
    expect(rs).toHaveLength(1);
    expect(rs[0].zh).toContain("10/10（國慶日）出勤 6 小時");
    expect(rs[0].cite.zh).toBe("勞動基準法第 39 條");
    const t = templateExplanation(r.computation, r.shifts, r.rules);
    for (const s of [t.textZh, t.messageToEmployer]) {
      expect(s).not.toMatch(/tw\.|ny\.|spread|休息日或國定假日/);
      expect(hasSimplified(s)).toBe(false);
    }
    expect(t.messageToEmployer).toContain("勞動基準法第 39 條");
    expect(t.messageToEmployer).toContain("一頁式計算報告");
    expect(r.premises.map((p) => p.zh).join("")).toContain("休息日：週四");
  });

  it("asks nothing of the employer when nothing is owed", async () => {
    const c = EVAL_CASES.find((x) => x.id === "tw-clean")!;
    const r = await run(c.input);
    expect(r.explanation.messageToEmployer).toContain("沒有發現短少");
  });

  it("states the no-rest-day premise when the worker says it is not fixed", async () => {
    const c = EVAL_CASES.find((x) => x.id === "tw-weekly-40")!;
    const r = await run({ ...c.input, restDayWeekday: null, dayOffWeekday: null });
    expect(r.premises.map((p) => p.zh).join("")).toContain("休息日不固定");
  });

  it("flags simplified Chinese", () => {
    expect(hasSimplified("工作22小时，实发4312")).toBe(true);
    expect(hasSimplified("工作 22 小時，實發 4,312")).toBe(false);
  });
});
