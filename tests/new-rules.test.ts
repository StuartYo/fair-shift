import { describe, expect, it } from "vitest";
import { DocStore } from "../lib/agent/citations";
import fixtures from "../fixtures/official-pages.json";
import { compute, resolveShifts } from "../lib/wage/compute";
import { fallbackLunarHolidays, fallbackRules } from "../lib/wage/fallback";
import { LUNAR_HOLIDAYS } from "../lib/wage/holidays-tw";
import { statedHourLimits, statedRates } from "../lib/wage/numbers";
import { parsePayslipRules } from "../lib/wage/parse";
import type { HolidayRecord, RuleRecord } from "../lib/wage/types";
import { verifyHoliday, verifyRule } from "../lib/wage/verify";

// Rules added 2026-10-14: Taiwan weekly 40-hour overtime, Taiwan lunar-calendar
// holidays 2026-2027, New York tip credit and spread of hours.
// Every expected number below is worked out by hand in the test name or comment.

const docs = new DocStore();
for (const d of (fixtures as { docs: { url: string; title: string; content: string }[] }).docs)
  docs.add({ ...d, via: "fixture_extract", retrievedAt: "2026-10-14" });

const RULES_20_1 = "https://laws.mol.gov.tw/FLAW/FLAWDAT0201.aspx?id=FL014931";
const ACT = "https://www.dgpa.gov.tw/information?uid=30&pid=12982";
const CR146 = "https://forms.labor.ny.gov/WP/CR146.pdf";
const CR142 = "https://forms.labor.ny.gov/WP/CR142.pdf";

const R = (key: RuleRecord["key"], value: number, extra: Partial<RuleRecord> = {}): RuleRecord => ({ key, value, status: "in_force", citations: [], recordedBy: "agent", ...extra });
const raw = (date: string, start: string, end: string, breakMinutes = 0) => ({ date, start, end, breakMinutes, marked: null, raw: "" });

describe("reading hours limits and the tipped overtime rate", () => {
  it("reads 40 from the weekly clause and 10 from both spread-of-hours clauses", () => {
    expect(statedHourLimits("一、每日工作時間超過八小時或每週工作總時數超過四十小時之部分。")).toEqual([40]);
    expect(statedHourLimits("(a) On each day on which the spread of hours exceeds 10, an employee shall receive")).toEqual([10]);
    expect(statedHourLimits("for any day in which: (a) the spread of hours exceeds 10 hours;")).toEqual([10]);
  });
  it("reads 1.5 from 'multiplied by 1½, minus the tip credit'", () => {
    expect(statedRates("the overtime rate shall be the employee's regular rate of pay before subtracting any tip credit, multiplied by 1½, minus the tip credit.")).toEqual([1.5]);
  });
});

describe("verification of the new rules", () => {
  const weekly = "一、每日工作時間超過八小時或每週工作總時數超過四十小時之部分。";
  it("accepts 40 hours a week from LSA Enforcement Rules Art. 20-1, and nothing else", () => {
    expect(verifyRule({ key: "tw.weekly_hours", value: 40, citations: [{ source_url: RULES_20_1, quote: weekly }] }, docs, "TW", "agent").ok).toBe(true);
    expect(verifyRule({ key: "tw.weekly_hours", value: 48, citations: [{ source_url: RULES_20_1, quote: weekly }] }, docs, "TW", "agent").ok).toBe(false);
    // The quote must have been retrieved from that page.
    expect(verifyRule({ key: "tw.weekly_hours", value: 40, citations: [{ source_url: ACT, quote: weekly }] }, docs, "TW", "agent").ok).toBe(false);
  });

  const row2026 = "$11.35 Cash Wage, $5.65 Credit, $17.00 Total on and after January 1, 2026.";
  const tip = (region: string, variant: string, value = 5.65, quote = row2026) =>
    verifyRule({ key: "ny.tip_credit", value, region, variant, effective_from: "2026-01-01", citations: [{ source_url: CR146, quote }] }, docs, "US-NY", "agent");
  it("ties a tip credit row to the region and job headings above it", () => {
    expect(tip("nyc", "food_service").ok).toBe(true);
    expect(tip("li_westchester", "food_service").ok).toBe(true); // same row also appears under Long Island
    expect(tip("rest", "food_service").ok).toBe(false); // rest of state is $5.30
    expect(tip("nyc", "service").ok).toBe(false); // service employees are $2.85
    expect(tip("nyc", "food_service", 11.35).ok).toBe(false); // the cash wage is not the credit
    expect(tip("rest", "food_service", 5.3, "$10.70 Cash Wage, $5.30 Credit, $16.00 Total on and after January 1, 2026.").ok).toBe(true);
    expect(tip("nyc", "service", 2.85, "$14.15 Cash Wage, $2.85 Credit, $3.65 Tip Threshold on and after January 1, 2026.").ok).toBe(true);
  });
  it("accepts the tipped overtime clause and the two spread-of-hours clauses", () => {
    const keys = fallbackRules(docs.all(), ["tw.weekly_hours", "ny.ot_tipped", "ny.spread_hosp", "ny.spread_misc", "ny.tip_credit"]);
    const found = new Set(keys.map((k) => k.key));
    expect([...found].sort()).toEqual(["ny.ot_tipped", "ny.spread_hosp", "ny.spread_misc", "ny.tip_credit", "tw.weekly_hours"]);
    for (const p of keys) expect(verifyRule(p, docs, p.key.startsWith("tw") ? "TW" : "US-NY", "code_fallback").ok, `${p.key} ${p.region ?? ""} ${p.variant ?? ""}`).toBe(true);
    // 2025 and 2026 rows for 3 regions x 2 tipped jobs
    expect(keys.filter((k) => k.key === "ny.tip_credit").length).toBe(12);
    // The hospitality clause cannot stand in for the general one.
    const hosp = keys.find((k) => k.key === "ny.spread_hosp")!;
    expect(verifyRule({ ...hosp, key: "ny.spread_misc" }, docs, "US-NY", "agent").ok).toBe(false);
    expect(verifyRule({ ...keys.find((k) => k.key === "ny.spread_misc")!, value: 12 }, docs, "US-NY", "agent").ok).toBe(false);
    expect(keys.find((k) => k.key === "ny.spread_misc")!.citations[0].source_url).toBe(CR142);
  });
});

describe("Taiwan lunar-calendar holidays", () => {
  it("pins the 2026 and 2027 dates from the official DGPA calendars", () => {
    expect(LUNAR_HOLIDAYS.map((h) => `${h.date} ${h.name}`)).toEqual([
      "2026-02-15 除夕前一日",
      "2026-02-16 除夕",
      "2026-02-17 春節",
      "2026-02-18 春節",
      "2026-02-19 春節",
      "2026-04-05 清明節",
      "2026-06-19 端午節",
      "2026-09-25 中秋節",
      "2027-02-04 除夕前一日",
      "2027-02-05 除夕",
      "2027-02-06 春節",
      "2027-02-07 春節",
      "2027-02-08 春節",
      "2027-04-05 清明節",
      "2027-06-09 端午節",
      "2027-09-15 中秋節",
    ]);
  });
  it("needs the lunar rule and the day-off clause, quoted from the act", () => {
    const [p] = fallbackLunarHolidays(docs.all(), ["2027-02-06"]);
    expect(p.citations.map((c) => c.quote)).toEqual(["一、除夕及春節：自農曆十二月末日之前一日至翌年一月三日，放假五日。"]);
    const ok = verifyHoliday(p, docs, "agent");
    expect(ok.ok && ok.value.dateSource?.url).toContain("pid=12982");
    const [m] = fallbackLunarHolidays(docs.all(), ["2026-09-25"]);
    expect(m.citations.map((c) => c.quote)).toEqual(["中秋節：農曆八月十五日。", "二、兒童節、清明節、勞動節、端午節、教師節及中秋節：均放假一日。"]);
    expect(verifyHoliday(m, docs, "agent").ok).toBe(true);
    // The New Year clause cannot be used for Mid-Autumn, and a government bridge day is not a holiday.
    expect(verifyHoliday({ ...m, citations: p.citations }, docs, "agent").ok).toBe(false);
    expect(verifyHoliday({ ...p, date: "2027-02-10" }, docs, "agent").ok).toBe(false);
  });
  it("matches a lunar holiday by full date, not by month and day", () => {
    const h: HolidayRecord = { monthDay: "09-25", date: "2026-09-25", name: "中秋節", citations: [], recordedBy: "agent" };
    const s = resolveShifts([raw("2026-09-25", "17:00", "22:00"), raw("2027-09-25", "17:00", "22:00")], { jurisdiction: "TW", holidays: [h] });
    expect(s.map((x) => x.dayType)).toEqual(["holiday", "workday"]);
  });
});

describe("Taiwan weekly 40-hour overtime", () => {
  const rules = [R("tw.ot_first2", 4 / 3), R("tw.ot_next2", 5 / 3), R("tw.rest_first2", 4 / 3), R("tw.rest_after2", 5 / 3), R("tw.holiday", 2), R("tw.weekly_hours", 40)];
  const week = (sat: [string, string]) => [
    raw("2026-10-19", "09:00", "17:00"),
    raw("2026-10-20", "09:00", "17:00"),
    raw("2026-10-21", "09:00", "17:00"),
    raw("2026-10-22", "09:00", "17:00"),
    raw("2026-10-23", "09:00", "17:00"),
    raw("2026-10-24", ...sat),
  ];
  it("5 x 8 h + 3 h on Saturday: 40 x 200 + 2 x 200 x 4/3 + 1 x 200 x 5/3 = 8,867", () => {
    const shifts = resolveShifts(week(["09:00", "12:00"]), { jurisdiction: "TW", holidays: [] });
    const c = compute({ jurisdiction: "TW", shifts, payslip: { currency: "TWD", hourlyRate: 200 }, rules });
    expect(c.expectedTotal).toBe(8867); // 8000 + 533.33 + 333.33 = 8866.67
    const sat = c.lines.filter((l) => l.date === "2026-10-24");
    expect(sat.map((l) => [l.hours, l.multiplier])).toEqual([
      [2, 4 / 3],
      [1, 5 / 3],
    ]);
    expect(sat[0].ruleKeys).toContain("tw.weekly_hours");
  });
  it("daily and weekly overtime on the same week: 4 x 8 h, Friday 10 h, Saturday 2 h = 40 x 200 + 4 x 200 x 4/3 = 9,067", () => {
    const days = week(["09:00", "11:00"]);
    days[4] = raw("2026-10-23", "09:00", "19:00");
    const c = compute({ jurisdiction: "TW", shifts: resolveShifts(days, { jurisdiction: "TW", holidays: [] }), payslip: { currency: "TWD", hourlyRate: 200 }, rules });
    expect(c.expectedTotal).toBe(9067); // 8000 + 533.33 (Fri hours 9-10) + 533.33 (Sat, over 40) = 9066.67
  });
  it("rest day hours are paid as rest day work and do not count toward the 40", () => {
    const shifts = resolveShifts(week(["09:00", "13:00"]), { jurisdiction: "TW", holidays: [], restDayWeekday: 6 });
    const c = compute({ jurisdiction: "TW", shifts, payslip: { currency: "TWD", hourlyRate: 200 }, rules });
    expect(c.expectedTotal).toBe(9200); // 8000 + 2 x 200 x 4/3 + 2 x 200 x 5/3 = 8000 + 533.33 + 666.67
    expect(c.lines.some((l) => l.ruleKeys.includes("tw.weekly_hours"))).toBe(false);
  });
  it("a holiday on your rest day is paid as rest day work (MOL 2026-10-07 example: 150 x 2 x 4/3 + 150 x 6 x 5/3 = 1,900)", () => {
    const h: HolidayRecord = { monthDay: "10-10", name: "國慶日", citations: [], recordedBy: "agent" };
    const shifts = resolveShifts([raw("2026-10-10", "09:00", "17:00")], { jurisdiction: "TW", holidays: [h], restDayWeekday: 6 });
    expect(shifts[0].dayType).toBe("rest_day");
    const c = compute({ jurisdiction: "TW", shifts, payslip: { currency: "TWD", hourlyRate: 150 }, rules });
    expect(c.expectedTotal).toBe(1900);
    expect(c.assumptions.some((a) => a.includes("補假"))).toBe(true);
  });
  it("without the weekly rule, says the weekly limit was not checked", () => {
    const shifts = resolveShifts(week(["09:00", "12:00"]), { jurisdiction: "TW", holidays: [] });
    const c = compute({ jurisdiction: "TW", shifts, payslip: { currency: "TWD", hourlyRate: 200 }, rules: rules.filter((r) => r.key !== "tw.weekly_hours") });
    expect(c.expectedTotal).toBe(8600); // 43 x 200, straight time
    expect(c.problems.some((p) => p.kind === "missing_rule" && p.ruleKeys.includes("tw.weekly_hours"))).toBe(true);
  });
});

describe("New York tipped workers and spread of hours", () => {
  const nyc = { effectiveFrom: "2026-01-01", region: "nyc" as const };
  const base = [R("ny.min_wage_hourly", 17, nyc), R("ny.ot_weekly", 1.5), R("ny.spread_hosp", 10), R("ny.spread_misc", 10)];
  const tipped = [...base, R("ny.tip_credit", 5.65, { ...nyc, variant: "food_service" }), R("ny.ot_tipped", 1.5)];
  it("tips too low: 30 h at $11.35 cash + $100 tips = $440.50 < 30 x $17 = $510, so the employer owes $69.50", () => {
    const days = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"].map((d) => raw(d, "12:00", "18:00"));
    const c = compute({
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "food_service",
      shifts: resolveShifts(days, { jurisdiction: "US-NY", holidays: [] }),
      payslip: { currency: "USD", hourlyRate: 11.35, tips: 100, grossPaid: 340.5 },
      rules: tipped,
    });
    expect(c.expectedTotal).toBe(410); // 340.50 cash + 69.50 make-up
    expect(c.shortfall).toBe(69.5);
    expect(c.problems.find((p) => p.kind === "below_min_wage")?.amount).toBe(69.5);
  });
  it("tipped cash wage below the minimum cash wage: $10.00 vs $11.35 for 10 h = $13.50 short", () => {
    const c = compute({
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "food_service",
      shifts: resolveShifts([raw("2026-10-19", "09:00", "14:00"), raw("2026-10-20", "09:00", "14:00")], { jurisdiction: "US-NY", holidays: [] }),
      payslip: { currency: "USD", hourlyRate: 10, tips: 300, grossPaid: 100 },
      rules: tipped,
    });
    expect(c.expectedTotal).toBe(113.5);
    expect(c.shortfall).toBe(13.5);
  });
  const split = [raw("2026-10-24", "10:00", "14:00"), raw("2026-10-24", "17:00", "22:00")];
  it("restaurant: a 12-hour spread adds one hour at $17.00 whatever the pay rate", () => {
    const c = compute({ jurisdiction: "US-NY", nyRegion: "nyc", nyJob: "hospitality", shifts: resolveShifts(split, { jurisdiction: "US-NY", holidays: [] }), payslip: { currency: "USD", hourlyRate: 25 }, rules: base });
    expect(c.expectedTotal).toBe(9 * 25 + 17);
  });
  it("other industries: at $17.00 the extra hour is owed (17 x 10 - 9 x 17 = $17); at $20.00 pay already covers it", () => {
    const run = (rate: number) =>
      compute({ jurisdiction: "US-NY", nyRegion: "nyc", nyJob: "general", shifts: resolveShifts(split, { jurisdiction: "US-NY", holidays: [] }), payslip: { currency: "USD", hourlyRate: rate }, rules: base });
    expect(run(17).expectedTotal).toBe(170);
    const high = run(20);
    expect(high.expectedTotal).toBe(180);
    expect(high.assumptions.some((a) => a.includes("already covers"))).toBe(true);
  });
  it("a 10-hour spread is not over 10", () => {
    const c = compute({ jurisdiction: "US-NY", nyRegion: "nyc", nyJob: "hospitality", shifts: resolveShifts([raw("2026-10-24", "08:00", "18:00", 30)], { jurisdiction: "US-NY", holidays: [] }), payslip: { currency: "USD", hourlyRate: 17 }, rules: base });
    expect(c.expectedTotal).toBe(9.5 * 17);
  });
});

describe("payslip parsing with tips", () => {
  it("never reads a tips line as wages paid", () => {
    const p = parsePayslipRules("Hourly rate: $11.35 (cash wage, tip credit taken)\nTips total: $610.00\nHours paid: 42\nGross wages: $476.70", "USD");
    expect(p).toMatchObject({ hourlyRate: 11.35, hoursPaid: 42, grossPaid: 476.7, tips: 610 });
  });
});

describe("plain reasons for the verdict", () => {
  it("names the rule and the extra pay it requires", async () => {
    const { EVAL_CASES } = await import("../eval/cases");
    const { MockProvider } = await import("../lib/llm/mock");
    const { FixtureSearchProvider } = await import("../lib/search/fixture");
    const { rulesMockScript } = await import("../lib/wage/agent");
    const { runFairShift } = await import("../lib/wage/run");
    const { whyLines } = await import("../lib/wage/export");
    const run = (id: string) =>
      runFairShift(EVAL_CASES.find((c) => c.id === id)!.input, {
        llm: new MockProvider(rulesMockScript()),
        search: new FixtureSearchProvider(fixtures as never),
        mode: "mock",
        modeNote: "test",
        today: "2026-10-14",
      });
    expect(whyLines(await run("tw-holiday-unpaid"))[0]).toMatchObject({ text: "Work on a national holiday is paid double" });
    expect(whyLines(await run("tw-holiday-unpaid"))[0].amount).toBeCloseTo(1176, 6); // 6 h x 196
    expect(whyLines(await run("ny-tipped-overtime"))[0].amount).toBeCloseTo(17, 6); // 2 h x (19.85 - 11.35)
    expect(whyLines(await run("tw-weekly-40"))[0]).toMatchObject({ text: expect.stringContaining("over 40 in a week") });
  });
});
