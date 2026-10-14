import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as feedback } from "../app/api/feedback/route";
import { GET as status } from "../app/api/status/route";
import { ROUND3_CASES } from "../eval/round3";
import fixtures from "../fixtures/official-pages.json";
import { cleanFeedback, FEEDBACK_PREFIX } from "../lib/feedback";
import { MockProvider } from "../lib/llm/mock";
import { FixtureSearchProvider, type FixtureSet } from "../lib/search/fixture";
import { _resetTavilyUsage, tavilyMonthlyOk } from "../lib/tavily-usage";
import { rulesMockScript } from "../lib/wage/agent";
import { longestRun, shiftCount } from "../lib/wage/compute";
import { headlineOf } from "../lib/wage/headline";
import { findBreakInfo, hourlyRateIn, parsePayslipRules, parseScheduleDetailed } from "../lib/wage/parse";
import { flagsOf, runFairShift } from "../lib/wage/run";
import type { CheckInput } from "../lib/wage/types";

// Fixes from the third review round. Synthetic data only.

const run = (input: CheckInput) =>
  runFairShift(input, {
    llm: new MockProvider(rulesMockScript()),
    search: new FixtureSearchProvider(fixtures as FixtureSet),
    mode: "mock",
    modeNote: "test",
    today: "2026-10-14",
  });
const byId = (id: string) => ROUND3_CASES.find((c) => c.id === id)!;
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  _resetTavilyUsage();
  vi.restoreAllMocks();
});

describe("hourly rate in the forms people write it", () => {
  it.each([
    ["時薪 196", 196],
    ["每小時196元", 196],
    ["196元/小時", 196],
    ["一小時196", 196],
    ["$16/hr", 16],
    ["$17 an hour", 17],
    ["You were paid 17.00 per hour", 17],
    ["Hourly rate: $17.50", 17.5],
  ])("%s", (text, rate) => {
    expect(hourlyRateIn(text)).toBe(rate);
    expect(parsePayslipRules(text, "TWD").hourlyRate).toBe(rate);
  });
  it("does not take an amount or hours for a rate", () => {
    expect(hourlyRateIn("總工時 12 小時 應發 2,352")).toBeUndefined();
  });
});

describe("breaks", () => {
  it.each([
    ["10/20 09:00-18:00 中間休息半小時", 30],
    ["10/20 09:00-18:00 休息一小時", 60],
    ["10/20 09:00-18:00 休息1個半小時", 90],
    ["Mon 9am-6pm, 30-minute break", 30],
    ["Mon 9am-6pm (lunch 1 hr)", 60],
    ["10/20 09:00-18:00 休1小時", 60],
  ])("%s", (line, min) => {
    expect(findBreakInfo(line)).toEqual({ minutes: min, stated: true });
  });
  it("says no break when the line says so, and nothing when it is silent", () => {
    expect(findBreakInfo("10/20 09:00-18:00 中間不休息")).toEqual({ minutes: 0, stated: true });
    expect(findBreakInfo("10/20 09:00-18:00")).toEqual({ minutes: 0, stated: false });
    expect(findBreakInfo("10/24 休息日 10-18")).toEqual({ minutes: 0, stated: false });
  });
});

describe("schedule lines", () => {
  it("reads two shifts on one line, and 18時-22時", () => {
    const p = parseScheduleDetailed("10/20 08:00-12:00 17:00-22:00\n10/21 08-12 17-21\n10月22日 週四 18時-22時", 2026);
    expect(p.shifts.map((s) => `${s.date} ${s.start}-${s.end}`)).toEqual([
      "2026-10-20 08:00-12:00",
      "2026-10-20 17:00-22:00",
      "2026-10-21 08:00-12:00",
      "2026-10-21 17:00-21:00",
      "2026-10-22 18:00-22:00",
    ]);
    expect(p.unread).toEqual([]);
  });
  it("lists a line with a time but no end time instead of dropping it", () => {
    const p = parseScheduleDetailed("10/20 18:00-22:00\n10/22 晚班 6點半到打烊\n10/23 18:00 開始", 2026);
    expect(p.shifts.length).toBe(1);
    expect(p.unread.map((u) => u.reason)).toEqual(["no_time_range", "no_time_range"]);
  });
  it("does not list a header with a date range, a title or a pay line", () => {
    const p = parseScheduleDetailed("店長：10/5~10/11這週班表\n【10月班表】\n時薪 196 總工時 22 小時\n週三 18-22", 2026);
    expect(p.unread).toEqual([]);
    expect(p.shifts.length).toBe(1);
  });
});

describe("a night shift across midnight", () => {
  it("is split at 0:00 and the part on National Day is paid double", async () => {
    const c = byId("r3-tw-overnight-into-holiday");
    const r = await run(c.input);
    const parts = r.shifts.filter((s) => s.raw.includes("22:00-02:00"));
    expect(parts.map((s) => [s.date, s.start, s.end, s.hours, s.dayType])).toEqual([
      ["2026-10-09", "22:00", "24:00", 2, "workday"],
      ["2026-10-10", "00:00", "02:00", 2, "holiday"],
    ]);
    expect(parts[1].continuesFrom).toBe(parts[0].id);
    expect(shiftCount(r.shifts)).toBe(2);
    expect(r.computation.expectedTotal).toBe(1960);
    expect(r.computation.assumptions.some((a) => a.includes("crosses midnight"))).toBe(true);
  });
  it("still counts a 9-hour night shift as one workday for the 8-hour limit", async () => {
    const r = await run({ jurisdiction: "TW", scheduleText: "10/20 22:00-07:00", payslipText: "時薪 196 應發 1,764" });
    // 9 h: 8 straight + 1 h at 4/3 = 1568 + 261.33
    expect(r.computation.expectedTotal).toBe(1829);
  });
});

describe("no break written", () => {
  it("shows a warning, marks the overtime and the message, and computes the reading with a break", async () => {
    const c = byId("r3-tw-no-break-stated");
    const r = await run(c.input);
    expect(flagsOf(r)).toContain("break_unstated");
    expect(r.premises.find((p) => p.id === "break_unstated")!.zh).toContain("沒寫休息");
    const alt = r.alternatives!.find((a) => a.id === "break_assumed")!;
    expect(alt.expectedTotal).toBe(3136);
    expect(alt.shortfall).toBe(0);
    expect(r.explanation.messageToEmployer).toContain("班表上沒有寫休息時間");
    expect(r.explanation.textZh).toContain("如果中間有休息");
  });
  it("does not warn when the break is written, or the shift is 6 hours or less", async () => {
    expect(flagsOf(await run(byId("r3-tw-break-trailing-half-hour").input))).toEqual([]);
    expect(flagsOf(await run({ jurisdiction: "TW", scheduleText: "10/20 16:00-22:00", payslipText: "時薪 196 應發 1,176" }))).toEqual([]);
  });
});

describe("only take-home pay (實領)", () => {
  it("a small gap is called possible deductions, and the employer message claims no amount", async () => {
    const r = await run(byId("r3-tw-net-only-small-gap").input);
    expect(headlineOf(r.computation, r.payslip)).toMatchObject({ kind: "maybe_deductions", amount: 86 });
    expect(r.explanation.messageToEmployer).not.toContain("86");
    expect(r.explanation.messageToEmployer).toContain("應發金額和扣款明細");
    expect(r.explanation.messageTranslation).not.toContain("86");
  });
  it("a large gap is shown as 'up to'", () => {
    const c = { expectedTotal: 4606, shortfall: 1568 } as Parameters<typeof headlineOf>[0];
    expect(headlineOf(c, { paidKind: "net" })).toMatchObject({ kind: "owed", upTo: true });
    expect(headlineOf(c, { paidKind: "gross" })).toMatchObject({ kind: "owed", upTo: false });
  });
});

describe("other warnings", () => {
  it("payslip hours above the schedule: the schedule may be incomplete", async () => {
    const r = await run(byId("r3-tw-hours-mismatch").input);
    expect(r.premises.find((p) => p.id === "hours_mismatch")!.zh).toContain("班表可能少貼");
  });
  it("seven days in a row is flagged under Art. 36 even with no day off given", async () => {
    const r = await run(byId("r3-tw-seven-days").input);
    expect(r.computation.problems.find((p) => p.id === "seven_days")!.messageZh).toContain("第 36 條");
    expect(longestRun(["2026-10-01", "2026-10-02", "2026-10-04"])).toEqual(["2026-10-01", "2026-10-02"]);
  });
  it("an unreadable line lowers the confidence and is listed in the result", async () => {
    const r = await run(byId("r3-tw-unreadable-time-line").input);
    expect(r.parse.confidence).toBe("low");
    expect(r.premises.find((p) => p.id === "unread_lines")!.zh).toContain("6點半到打烊");
  });
});

describe("tester feedback", () => {
  it("keeps only the answer, a redacted comment, the language and the version", () => {
    const e = cleanFeedback({ answer: "no", comment: "王小明 0912345678 的加班費算錯", lang: "zh", version: "0.3.0", scheduleText: "10/5 17:00-22:00", payslipText: "時薪 196" });
    expect(e).toEqual({ answer: "no", comment: expect.not.stringContaining("0912345678"), lang: "zh", version: "0.3.0" });
    expect(JSON.stringify(e)).not.toContain("17:00");
    expect(cleanFeedback({ answer: "maybe" })).toBeTypeOf("string");
    expect(cleanFeedback({ answer: "yes", comment: "x".repeat(301) })).toBeTypeOf("string");
  });
  it("writes one prefixed log line and nothing from the pasted text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const res = await feedback(
      new Request("http://localhost/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9" },
        body: JSON.stringify({ answer: "yes", lang: "en", version: "0.3.0", scheduleText: "SECRET-SCHEDULE" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line.startsWith(FEEDBACK_PREFIX)).toBe(true);
    expect(line).not.toContain("SECRET-SCHEDULE");
    expect(line).not.toContain("198.51.100.9");
  });
});

describe("Tavily caps", () => {
  it("stops live checks once the account reaches the monthly stop", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    process.env.APP_TAVILY_MONTHLY_STOP = "1000";
    const fake = (used: number) => async () => new Response(JSON.stringify({ account: { plan_usage: used, plan_limit: 1500 } }));
    expect(await tavilyMonthlyOk(fake(999))).toBe(true);
    _resetTavilyUsage();
    expect(await tavilyMonthlyOk(fake(1000))).toBe(false);
    _resetTavilyUsage();
    expect(await tavilyMonthlyOk(async () => new Response("", { status: 500 }))).toBe(true);
  });
  it("/api/status says how many fresh checks the daily credit cap allows", async () => {
    const j = await (await status()).json();
    expect(j.tavily.coldChecksPerDay).toBe(Math.floor(j.caps.globalTavilyCreditsPerDay / j.tavily.creditsPerColdCheck));
    expect(j.tavily.monthlyStop).toBe(1000);
  });
});
