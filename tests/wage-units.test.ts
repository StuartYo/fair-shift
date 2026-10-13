import { describe, expect, it } from "vitest";
import { DocStore } from "../lib/agent/citations";
import fixtures from "../fixtures/official-pages.json";
import { compute, resolveShifts } from "../lib/wage/compute";
import { fallbackHolidays, fallbackRules } from "../lib/wage/fallback";
import { cnInt, statedDates, statedMonthDays, statedRates } from "../lib/wage/numbers";
import { parsePayslipRules, parseScheduleRules, shiftHours } from "../lib/wage/parse";
import { redact } from "../lib/wage/redact";
import type { RuleRecord } from "../lib/wage/types";
import { verifyHoliday, verifyRule } from "../lib/wage/verify";

const docs = new DocStore();
for (const d of (fixtures as { docs: { url: string; title: string; content: string }[] }).docs)
  docs.add({ ...d, via: "fixture_extract", retrievedAt: "2026-10-13" });

const LSA24 = "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=24";
const HIST = "https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/";
const P2027 = "https://www.mol.gov.tw/1607/1632/1633/99195/post";
const P700 = "https://dol.ny.gov/system/files/documents/2025/12/p700_12-25.pdf";

describe("number and date parsing", () => {
  it("reads Chinese numerals and fractions", () => {
    expect(cnInt("二十八")).toBe(28);
    expect(cnInt("十二")).toBe(12);
    expect(cnInt("一百十六")).toBe(116);
    expect(statedRates("按平日每小時工資額加給三分之一以上")).toEqual([1 / 3]);
    expect(statedRates("另再加給一又三分之二以上")[0]).toBeCloseTo(5 / 3, 12);
    expect(statedRates("工資應加倍發給")).toEqual([2]);
    expect(statedRates("pay them at 1 ½ times the regular wage")).toEqual([1.5]);
  });
  it("reads ROC, slash and English dates", () => {
    expect(statedDates("自115年1月1日起實施")).toEqual(["2026-01-01"]);
    expect(statedDates("From 01/01/2026 to 12/31/2026")).toEqual(["2026-01-01", "2026-12-31"]);
    expect(statedDates("On January 1, 2027, New York")).toEqual(["2027-01-01"]);
    expect(statedMonthDays("國慶日：十月十日")).toEqual(["10-10"]);
  });
});

describe("rule verification", () => {
  it("accepts the 2026 Taiwan rate with its date", () => {
    const q = "民國114年10月21日發布，自115年1月1日起實施，訂定每月最低工資為29,500元，每小時最低工資為196元。";
    const r = verifyRule({ key: "tw.min_wage_hourly", value: 196, effective_from: "2026-01-01", citations: [{ source_url: HIST, quote: q }] }, docs, "TW", "agent");
    expect(r.ok && r.value.status).toBe("in_force");
  });
  it("rejects the monthly figure passed off as the hourly rate", () => {
    const q = "民國114年10月21日發布，自115年1月1日起實施，訂定每月最低工資為29,500元，每小時最低工資為196元。";
    const r = verifyRule({ key: "tw.min_wage_hourly", value: 29500, effective_from: "2026-01-01", citations: [{ source_url: HIST, quote: q }] }, docs, "TW", "agent");
    expect(r.ok).toBe(false);
  });
  it("rejects the old rate in a quote that mentions it", () => {
    const q = "決定自116年1月1日起，每月最低工資由29,500元調整至30,900元，調升1,400元，調幅4.745％；每小時最低工資則比照每月最低工資之調幅，由196元調整至205元。調整案將由勞動部陳報行政院核定。";
    expect(verifyRule({ key: "tw.min_wage_hourly", value: 196, effective_from: "2027-01-01", citations: [{ source_url: P2027, quote: q }] }, docs, "TW", "agent").ok).toBe(false);
    const ok = verifyRule({ key: "tw.min_wage_hourly", value: 205, effective_from: "2027-01-01", citations: [{ source_url: P2027, quote: q }] }, docs, "TW", "agent");
    expect(ok.ok && ok.value.status).toBe("pending_approval");
  });
  it("rejects a date the quote does not state", () => {
    const q = "民國114年10月21日發布，自115年1月1日起實施，訂定每月最低工資為29,500元，每小時最低工資為196元。";
    expect(verifyRule({ key: "tw.min_wage_hourly", value: 196, effective_from: "2026-07-01", citations: [{ source_url: HIST, quote: q }] }, docs, "TW", "agent").ok).toBe(false);
  });
  it("checks the multiplier against the clause, and the clause against the rule", () => {
    const first = "延長工作時間在二小時以內者，按平日每小時工資額加給三分之一以上。";
    expect(verifyRule({ key: "tw.ot_first2", value: 4 / 3, citations: [{ source_url: LSA24, quote: first }] }, docs, "TW", "agent").ok).toBe(true);
    expect(verifyRule({ key: "tw.ot_first2", value: 1 / 3, citations: [{ source_url: LSA24, quote: first }] }, docs, "TW", "agent").ok).toBe(false);
    expect(verifyRule({ key: "tw.ot_next2", value: 4 / 3, citations: [{ source_url: LSA24, quote: first }] }, docs, "TW", "agent").ok).toBe(false);
  });
  it("ties a New York amount to its region", () => {
    const q = "$16.00 per hour in the Remainder of New York State";
    expect(verifyRule({ key: "ny.min_wage_hourly", value: 16, region: "rest", effective_from: "2026-01-01", citations: [{ source_url: P700, quote: q }, { source_url: P700, quote: "From 01/01/2026 to 12/31/2026, the New York State basic minimum wage is:" }] }, docs, "US-NY", "agent").ok).toBe(true);
    expect(verifyRule({ key: "ny.min_wage_hourly", value: 16, region: "nyc", effective_from: "2026-01-01", citations: [{ source_url: P700, quote: q }, { source_url: P700, quote: "From 01/01/2026 to 12/31/2026, the New York State basic minimum wage is:" }] }, docs, "US-NY", "agent").ok).toBe(false);
  });
  it("verifies a holiday only with a date quote and a day-off quote", () => {
    const H = "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0020095";
    const props = fallbackHolidays(docs.all());
    const natl = props.find((p) => p.month_day === "10-10")!;
    expect(verifyHoliday(natl, docs, "agent").ok).toBe(true);
    expect(verifyHoliday({ ...natl, citations: [natl.citations[0]] }, docs, "agent").ok).toBe(false);
    // 國父誕辰紀念日 has a date but is not a day off
    expect(props.some((p) => p.month_day === "11-12")).toBe(false);
    expect(verifyHoliday({ month_day: "11-12", name: "國父誕辰紀念日", citations: [{ source_url: H, quote: "國父誕辰紀念日：十一月十二日" }] }, docs, "agent").ok).toBe(false);
  });
  it("finds the paid fixed-date holidays in the holiday act", () => {
    const mds = fallbackHolidays(docs.all()).map((p) => p.month_day).sort();
    expect(mds).toEqual(["01-01", "02-28", "04-04", "05-01", "09-28", "09-28", "10-10", "10-25", "12-25"]);
  });
  it("code fallback extracts every Taiwan and New York rule from the recorded pages", () => {
    const keys = fallbackRules(docs.all(), ["tw.min_wage_hourly", "tw.ot_first2", "tw.ot_next2", "tw.rest_first2", "tw.rest_after2", "tw.holiday", "tw.day_off", "ny.min_wage_hourly", "ny.ot_weekly"]);
    const found = new Set(keys.map((k) => k.key));
    expect(found.size).toBe(9);
    for (const p of keys) expect(verifyRule(p, docs, p.key.startsWith("tw") ? "TW" : "US-NY", "code_fallback").ok).toBe(true);
  });
});

describe("pay computation (Taiwan)", () => {
  const R = (key: RuleRecord["key"], value: number, extra: Partial<RuleRecord> = {}): RuleRecord => ({ key, value, status: "in_force", citations: [], recordedBy: "agent", ...extra });
  const rules = [
    R("tw.min_wage_hourly", 196, { effectiveFrom: "2026-01-01" }),
    R("tw.ot_first2", 4 / 3),
    R("tw.ot_next2", 5 / 3),
    R("tw.rest_first2", 4 / 3),
    R("tw.rest_after2", 5 / 3),
    R("tw.holiday", 2),
    R("tw.day_off", 2),
  ];
  it("matches MOL's own rest day example (150 x 2 x 4/3 + 150 x 6 x 5/3 = 1,900)", () => {
    const shifts = resolveShifts([{ date: "2026-10-10", start: "09:00", end: "17:00", breakMinutes: 0, marked: "rest_day", raw: "" }], { jurisdiction: "TW", holidays: [] });
    const c = compute({ jurisdiction: "TW", shifts, payslip: { currency: "TWD", hourlyRate: 150 }, rules: rules.filter((r) => r.key !== "tw.min_wage_hourly") });
    expect(c.expectedTotal).toBe(1900);
  });
  it("splits a 12-hour workday into 8 + 2 + 2", () => {
    const shifts = resolveShifts([{ date: "2026-10-13", start: "08:00", end: "21:00", breakMinutes: 60, marked: null, raw: "" }], { jurisdiction: "TW", holidays: [] });
    const c = compute({ jurisdiction: "TW", shifts, payslip: { currency: "TWD", hourlyRate: 200 }, rules });
    expect(c.lines.map((l) => [l.hours, l.multiplier])).toEqual([
      [8, 1],
      [2, 4 / 3],
      [2, 5 / 3],
    ]);
    expect(c.expectedTotal).toBe(Math.round(1600 + 533.333 + 666.667));
  });
  it("counts holiday hours double and over-8 holiday hours as overtime", () => {
    const shifts = resolveShifts([{ date: "2026-10-10", start: "08:00", end: "18:00", breakMinutes: 0, marked: "holiday", raw: "" }], { jurisdiction: "TW", holidays: [] });
    const c = compute({ jurisdiction: "TW", shifts, payslip: { currency: "TWD", hourlyRate: 196 }, rules });
    expect(c.expectedTotal).toBe(Math.round(8 * 196 * 2 + 2 * 196 * (4 / 3)));
  });
  it("counts missing rules at straight time and says so", () => {
    const shifts = resolveShifts([{ date: "2026-10-10", start: "08:00", end: "14:00", breakMinutes: 0, marked: "holiday", raw: "" }], { jurisdiction: "TW", holidays: [] });
    const c = compute({ jurisdiction: "TW", shifts, payslip: { currency: "TWD", hourlyRate: 196, grossPaid: 1176 }, rules: [rules[0]] });
    expect(c.expectedTotal).toBe(1176);
    expect(c.problems.some((p) => p.kind === "missing_rule")).toBe(true);
  });
});

describe("parsing and redaction", () => {
  it("parses messy Chinese and English schedules", () => {
    const s = parseScheduleRules("10/7(三) 下午5點到10點\n10/8 晚上6點半-10點半\nMon Oct 5 9am-6pm (30 min break)\n2026-10-13 22:00-06:00 休息60分", 2026);
    expect(s.map((x) => [x.date, x.start, x.end, x.breakMinutes])).toEqual([
      ["2026-10-07", "17:00", "22:00", 0],
      ["2026-10-08", "18:30", "22:30", 0],
      ["2026-10-05", "09:00", "18:00", 30],
      ["2026-10-13", "22:00", "06:00", 60],
    ]);
    expect(shiftHours("22:00", "06:00", 60)).toBe(7);
  });
  it("reads payslip numbers", () => {
    const p = parsePayslipRules("Pay period 2026-10-05 to 2026-10-11\nHourly rate: $17.00\nHours paid: 42.5\nGross pay: $722.50", "USD");
    expect(p).toMatchObject({ hourlyRate: 17, hoursPaid: 42.5, grossPaid: 722.5, periodStart: "2026-10-05" });
  });
  it("removes personal details before any API call", () => {
    const r = redact("姓名：王小明\n身分證 A123456789\n電話 0912-345-678\nEmployee: Jane Doe\nemail jane@example.com\n10/5 17:00-22:00");
    expect(r.text).not.toMatch(/王小明|A123456789|0912|Jane Doe|jane@example/);
    expect(r.text).toContain("10/5 17:00-22:00");
    expect(r.count).toBe(5);
  });
});
