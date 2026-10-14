import { describe, expect, it } from "vitest";
import { DocStore } from "../lib/agent/citations";
import { MOL_BASIC_WAGE_HISTORY, NY_MW_HISTORY } from "../lib/wage/catalog";
import { compute, resolveShifts } from "../lib/wage/compute";
import { fallbackRules } from "../lib/wage/fallback";
import { notYetHoliday } from "../lib/wage/holidays-tw";
import { shiftHours } from "../lib/wage/parse";
import type { HolidayRecord, RuleRecord } from "../lib/wage/types";
import { nyHistoryAmounts, statedStartDates, verifyRule } from "../lib/wage/verify";
import { buildTask } from "../lib/wage/agent";

// Fixes after the first real-world run (eval/results/realworld-2026-10-14T03-26-59-071Z):
// minimum wages before 2026 were never found, 2023-09-28 was paid as Teachers' Day,
// and hours were rounded to 0.01 before multiplying.

// Excerpts of the two official history pages as Tavily extract returned them on 2026-10-14.
const TW_HISTORY_TEXT =
  "37.民國111年9月14日發布，自112年1月1日起實施，每月基本工資調整為26,400 元，每小時基本工資調整為176元。 38.民國112年9月14日發布，自113年1月1日起實施，每月基本工資調整為27,470 元，每小時基本工資調整為183元。";
const NY_HISTORY_TEXT = `Basic Minimum Hourly Rates (other than fast food employees)
New York City:
Large employers of 11 or more employees:
$15.00 per hour on and after December 31, 2018.
Small employers of 10 or fewer employees:
$15.00 per hour on and after December 31, 2019.
All Employers:
$16.00 per hour on and after January 1, 2024;
$16.50 per hour on and after January 1, 2025;
$17.00 per hour on and after January 1, 2026.
Long Island, and Westchester counties:
$15.00 per hour on and after December 31, 2021;
$16.00 per hour on and after January 1, 2024;
$16.50 per hour on and after January 1, 2025;
$17.00 per hour on and after January 1, 2026.
Remainder of state (outside of New York City and Nassau, Suffolk, and Westchester counties):
$15.00 per hour on and after January 1, 2024;
$15.50 per hour on and after January 1, 2025;
$16.00 per hour on and after January 1, 2026.
Minimum Hourly Rates for Fast Food Employees
New York City:
$16.50 per hour on and after January 1, 2025;
Outside of New York City:
$15.50 per hour on and after January 1, 2025;`;

const docs = new DocStore();
docs.add({ url: MOL_BASIC_WAGE_HISTORY, title: "基本工資之制訂與調整經過", content: TW_HISTORY_TEXT, via: "tavily_extract", retrievedAt: "2026-10-14" });
docs.add({ url: NY_MW_HISTORY, title: "History of the Minimum Wage in New York State", content: NY_HISTORY_TEXT, via: "tavily_extract", retrievedAt: "2026-10-14" });

const line38 = "38.民國112年9月14日發布，自113年1月1日起實施，每月基本工資調整為27,470 元，每小時基本工資調整為183元。";

describe("past minimum wages from the official history pages", () => {
  it("adds the history pages to the task only for shift dates before the seeds' years", () => {
    expect(buildTask("TW", ["2024-06-06"]).pages.some((p) => p.url === MOL_BASIC_WAGE_HISTORY)).toBe(true);
    expect(buildTask("TW", ["2026-10-05"]).pages.some((p) => p.url === MOL_BASIC_WAGE_HISTORY)).toBe(false);
    expect(buildTask("US-NY", ["2025-01-06"], "nyc").pages.some((p) => p.url === NY_MW_HISTORY)).toBe(true);
    expect(buildTask("US-NY", ["2026-10-05"], "nyc").pages.some((p) => p.url === NY_MW_HISTORY)).toBe(false);
  });

  it("accepts the 2024 basic wage line (每小時基本工資) from the date after 自, not the announcement date", () => {
    const ok = verifyRule({ key: "tw.min_wage_hourly", value: 183, effective_from: "2024-01-01", citations: [{ source_url: MOL_BASIC_WAGE_HISTORY, quote: line38 }] }, docs, "TW", "agent");
    expect(ok.ok && ok.value.effectiveFrom).toBe("2024-01-01");
    expect(ok.ok && ok.value.status).toBe("in_force");
    const wrongDate = verifyRule({ key: "tw.min_wage_hourly", value: 183, effective_from: "2023-09-14", citations: [{ source_url: MOL_BASIC_WAGE_HISTORY, quote: line38 }] }, docs, "TW", "agent");
    expect(wrongDate.ok).toBe(false);
    expect(statedStartDates(line38)).toEqual(["2024-01-01"]);
  });

  it("reads a New York history row's region from the heading above it, and refuses fast food and employer-size rows", () => {
    expect(nyHistoryAmounts(docs, NY_MW_HISTORY, "$16.50 per hour on and after January 1, 2025;", "nyc")).toEqual([16.5]);
    expect(nyHistoryAmounts(docs, NY_MW_HISTORY, "$15.50 per hour on and after January 1, 2025;", "rest")).toEqual([15.5]);
    // $15.00 on December 31, 2018 is only listed for large NYC employers: employer size is not asked.
    expect(nyHistoryAmounts(docs, NY_MW_HISTORY, "$15.00 per hour on and after December 31, 2018.", "nyc")).toEqual([]);
    const r = verifyRule(
      { key: "ny.min_wage_hourly", value: 16, region: "nyc", effective_from: "2024-01-01", citations: [{ source_url: NY_MW_HISTORY, quote: "$16.00 per hour on and after January 1, 2024;" }] },
      docs,
      "US-NY",
      "agent",
    );
    expect(r.ok && r.value.effectiveFrom).toBe("2024-01-01");
    const late = verifyRule(
      { key: "ny.min_wage_hourly", value: 16, region: "nyc", effective_from: "2025-01-01", citations: [{ source_url: NY_MW_HISTORY, quote: "$16.00 per hour on and after January 1, 2024;" }] },
      docs,
      "US-NY",
      "agent",
    );
    expect(late.ok).toBe(false);
  });

  it("code fallback reads the same rows, and they pass the same checks", () => {
    const docList = [docs.page(MOL_BASIC_WAGE_HISTORY)!, docs.page(NY_MW_HISTORY)!];
    const tw = fallbackRules(docList, ["tw.min_wage_hourly"]);
    expect(tw.map((p) => [p.value, p.effective_from])).toEqual([
      [176, "2023-01-01"],
      [183, "2024-01-01"],
    ]);
    for (const p of tw) expect(verifyRule(p, docs, "TW", "code_fallback").ok).toBe(true);
    const ny = fallbackRules(docList, ["ny.min_wage_hourly"]).filter((p) => p.region === "nyc");
    expect(ny.map((p) => [p.value, p.effective_from])).toEqual([
      [16, "2024-01-01"],
      [16.5, "2025-01-01"],
      [17, "2026-01-01"],
    ]);
    for (const p of ny) expect(verifyRule(p, docs, "US-NY", "code_fallback").ok).toBe(true);
  });
});

describe("Teachers' Day, Retrocession Day and Constitution Day before 2025", () => {
  const teachers: HolidayRecord = { monthDay: "09-28", name: "教師節", citations: [], recordedBy: "agent" };
  const raw = (date: string) => ({ date, start: "09:00", end: "19:00", breakMinutes: 60, marked: null, raw: "" });
  it("are normal days before the 2025 amendment took effect", () => {
    expect(notYetHoliday("09-28", "2023-09-28")).toBe(true);
    expect(notYetHoliday("09-28", "2025-09-28")).toBe(false);
    expect(notYetHoliday("10-10", "2023-10-10")).toBe(false);
    const [s23] = resolveShifts([raw("2023-09-28")], { jurisdiction: "TW", holidays: [teachers] });
    const [s25] = resolveShifts([raw("2025-09-28")], { jurisdiction: "TW", holidays: [teachers] });
    expect(s23.dayType).toBe("workday");
    expect(s25.dayType).toBe("holiday");
  });
  it("2023-09-28, 9 hours at NT$176: one overtime hour, 176 x 8 + 176 x 4/3 = 1,642.67 -> 1,643", () => {
    const R = (key: RuleRecord["key"], value: number, extra: Partial<RuleRecord> = {}): RuleRecord => ({ key, value, status: "in_force", citations: [], recordedBy: "agent", ...extra });
    const rules = [R("tw.min_wage_hourly", 176, { effectiveFrom: "2023-01-01" }), R("tw.ot_first2", 4 / 3), R("tw.holiday", 2), R("tw.weekly_hours", 40)];
    const shifts = resolveShifts([raw("2023-09-28")], { jurisdiction: "TW", holidays: [teachers] });
    const c = compute({ jurisdiction: "TW", shifts, payslip: { hourlyRate: 176, grossPaid: 1408, currency: "TWD" }, rules });
    expect(c.expectedTotal).toBe(1643);
    expect(c.shortfall).toBe(235);
    expect(c.assumptions.some((a) => a.includes("became national days off only from 2025-05-30"))).toBe(true);
  });
});

describe("hours to the minute", () => {
  it("keeps 14 h 20 min and 50 min exact", () => {
    expect(shiftHours("07:00", "21:20", 0)).toBeCloseTo(14 + 1 / 3, 6);
    expect(shiftHours("11:00", "20:50", 0)).toBeCloseTo(9 + 5 / 6, 6);
  });
  it("prices 50 minutes of overtime at 183 x 5/3 x 50/60 = 254.17, as the court's table does", () => {
    const R = (key: RuleRecord["key"], value: number, extra: Partial<RuleRecord> = {}): RuleRecord => ({ key, value, status: "in_force", citations: [], recordedBy: "agent", ...extra });
    const rules = [R("tw.min_wage_hourly", 183, { effectiveFrom: "2024-01-01" }), R("tw.ot_first2", 4 / 3), R("tw.ot_next2", 5 / 3), R("tw.weekly_hours", 40)];
    const shifts = resolveShifts([{ date: "2024-02-03", start: "11:00", end: "21:50", breakMinutes: 0, marked: null, raw: "" }], { jurisdiction: "TW", holidays: [] });
    const c = compute({ jurisdiction: "TW", shifts, payslip: { hourlyRate: 183, currency: "TWD" }, rules });
    // 183 x 8 + 183 x 4/3 x 2 + 183 x 5/3 x 50/60 = 1,464 + 488 + 254.17 = 2,206.17
    expect(c.expectedTotal).toBe(2206);
    expect(c.lines.every((l) => Math.round(l.hours * 100) === l.hours * 100)).toBe(true);
  });
});
