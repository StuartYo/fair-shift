import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "../eval/cases";
import { HELDOUT_CASES } from "../eval/heldout";
import { REALSTYLE_CASES } from "../eval/realstyle";
import { matchSample, SAMPLE_CASES } from "../eval/samples";
import fixtures from "../fixtures/official-pages.json";
import { AgentSession } from "../lib/agent/session";
import { limits, TAVILY_CREDITS_PER_COLD_CHECK } from "../lib/config";
import { MockProvider } from "../lib/llm/mock";
import { precomputedFor } from "../lib/precomputed";
import { FixtureSearchProvider, type FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { holidayNameEn } from "../lib/wage/explain";
import { parsePayslipRules, parseScheduleDetailed, scheduleDateRange } from "../lib/wage/parse";
import { runFairShift } from "../lib/wage/run";
import type { CheckInput } from "../lib/wage/types";

// Fixes from the second review round. Synthetic data only.

const run = (input: CheckInput) =>
  runFairShift(input, {
    llm: new MockProvider(rulesMockScript()),
    search: new FixtureSearchProvider(fixtures as FixtureSet),
    mode: "mock",
    modeNote: "test",
    today: "2026-10-14",
  });
const all = [...EVAL_CASES, ...HELDOUT_CASES, ...REALSTYLE_CASES];
const byId = (id: string) => all.find((c) => c.id === id)!;

describe("LINE schedules with the week in a header line", () => {
  it("reads the date range from the header and places weekday-only lines in it", () => {
    expect(scheduleDateRange("店長：10/5~10/11這週班表\n週三 18-22", 2026)).toEqual({ start: "2026-10-05", end: "2026-10-11" });
    expect(scheduleDateRange("下週(10/19-10/25)排班如下", 2026)).toEqual({ start: "2026-10-19", end: "2026-10-25" });
    expect(scheduleDateRange("12/28~1/3", 2026)).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    const p = parseScheduleDetailed("店長：10/5~10/11這週班表\n週三 下午5點半到10點\n週五 18-22 休1小時\n六 中午12點-晚上8點半", 2026);
    expect(p.shifts.map((s) => [s.date, s.start, s.end, s.breakMinutes])).toEqual([
      ["2026-10-07", "17:30", "22:00", 0],
      ["2026-10-09", "18:00", "22:00", 60],
      ["2026-10-10", "12:00", "20:30", 0],
    ]);
    expect(p.unread).toEqual([]);
  });
  it("prefers the schedule's own range over the payslip period for weekday lines", () => {
    const p = parseScheduleDetailed("下週(10/19-10/25)\n禮拜三 17-22", 2026, { start: "2026-10-01", end: "2026-10-31" });
    expect(p.shifts[0].date).toBe("2026-10-21");
  });
  it("reads 中午 and 凌晨 times", () => {
    const p = parseScheduleDetailed("10/5 中午12點到5點\n10/6 晚上10點到凌晨2點", 2026);
    expect(p.shifts.map((s) => [s.start, s.end])).toEqual([
      ["12:00", "17:00"],
      ["22:00", "02:00"],
    ]);
  });
});

describe("payslip amounts", () => {
  it("reads 實領 as net pay and says so", () => {
    expect(parsePayslipRules("時薪 190 實領 2,660", "TWD")).toMatchObject({ hourlyRate: 190, grossPaid: 2660, paidKind: "net" });
  });
  it("prefers gross pay (應發) over net pay after insurance (實發)", () => {
    const p = parsePayslipRules("時薪 200\n應發工資 3,400\n勞保自付 -186\n健保自付 -95\n實發金額 3,119", "TWD");
    expect(p).toMatchObject({ grossPaid: 3400, netPaid: 3119, paidKind: "gross" });
  });
  it("finds a monthly salary and no hourly rate", () => {
    const p = parsePayslipRules("10月薪資\n月薪 28,000\n實領 26,800", "TWD");
    expect(p.hourlyRate).toBeUndefined();
    expect(p.monthlySalary).toBe(28000);
  });
  it("reads a one-line US payslip with tips and gross on the same line", () => {
    const p = parsePayslipRules("Hourly rate $11.35 Tips $200 Gross pay $300", "USD");
    expect(p).toMatchObject({ hourlyRate: 11.35, tips: 200, grossPaid: 300 });
    expect(parsePayslipRules("Gross pay $440.00 (includes tips) Tips $200", "USD").tipsInGross).toBe(true);
  });
});

describe("no silent guesses", () => {
  it("a monthly salary stops and asks for the hourly rate, without running the agent", async () => {
    const r = await run(byId("rs-tw-monthly-salary").input);
    expect(r.needsInput).toMatchObject({ part: "payslip", kind: "hourly_rate", monthlySalary: 28000 });
    expect(r.needsInput!.en).toContain("payslip box");
    expect(r.needsInput!.zh).toContain("問題在「薪資單」");
    expect(r.computation.lines).toEqual([]);
    expect(r.trace.some((t) => t.name === "agent" || t.name === "fetch_official")).toBe(false);
  });
  it("no rate anywhere asks too; a rate typed in the form is used and said", async () => {
    const input: CheckInput = { jurisdiction: "TW", scheduleText: "10/13 17:00-22:00", payslipText: "實領 950", restDayWeekday: null, dayOffWeekday: null };
    expect((await run(input)).needsInput?.kind).toBe("hourly_rate");
    const r = await run({ ...input, hourlyRate: 190 });
    expect(r.needsInput).toBeUndefined();
    expect(r.computation.expectedTotal).toBe(980); // 5 h x 196 (the rate typed is below the minimum)
    expect(r.premises.some((p) => p.en.includes("you typed"))).toBe(true);
  });
  it("net pay gets a premise about deductions", async () => {
    const r = await run(byId("rs-tw-net-pay-one-line").input);
    expect(r.premises.some((p) => p.zh.includes("勞保") && p.en.includes("net pay"))).toBe(true);
  });
});

describe("a holiday that may be the rest day: both readings", () => {
  it("rest day unknown: holiday double pay first, rest day reading beside it", async () => {
    const r = await run(byId("rs-tw-line-header-week").input);
    expect(r.computation.expectedTotal).toBe(4606);
    const a = r.alternatives?.find((x) => x.id === "holiday_as_rest_day");
    // 10/10 as a rest day: 8 h = 2 x 196 x 4/3 + 6 x 196 x 5/3 = 522.67 + 1960 = 2482.67; plus 4.5 + 3 h at 196 = 1470.
    expect(a?.expectedTotal).toBe(3953);
    expect(a?.dates).toEqual(["2026-10-10"]);
  });
  it("rest day is Saturday: rest day rates first (MOL 2026-10-07), the holiday reading beside it", async () => {
    const r = await run(byId("ho-tw-holiday-on-rest-day").input);
    expect(r.computation.expectedTotal).toBe(3867);
    const a = r.alternatives?.find((x) => x.id === "holiday_as_holiday");
    expect(a?.expectedTotal).toBe(4400); // 10 h x 200 + 6 h x 200 x 2
    expect(a?.shortfall).toBe(1200);
  });
  it("no alternative when the rest day is another weekday", async () => {
    const r = await run(byId("tw-holiday-unpaid").input);
    expect(r.alternatives).toBeUndefined();
  });
});

describe("New York tipped pay", () => {
  const tipped = byId("ho-ny-tips-below-minimum").input;
  it("not sure whether gross includes tips: both readings, no false certainty", async () => {
    const r = await run({ ...tipped, nyTipsInGross: "unsure" });
    expect(r.computation.shortfall).toBe(69.5);
    const a = r.alternatives?.find((x) => x.id === "tips_in_gross");
    expect(a?.paidTotal).toBe(240.5); // 340.50 - 100.00 tips
  });
  it("gross includes tips: wages paid are gross minus tips", async () => {
    const r = await run(byId("rs-ny-tips-in-gross").input);
    expect(r.computation.paidTotal).toBe(240);
    expect(r.computation.shortfall).toBe(32.4);
  });
  it("gross includes tips but the amount is missing: no difference is shown", async () => {
    const r = await run({ ...tipped, payslipText: "Hourly rate: $11.35\nGross pay: $440.50", nyTipsInGross: "yes" });
    expect(r.computation.shortfall).toBeUndefined();
    expect(r.premises.some((p) => p.en.includes("tips amount is not on the payslip"))).toBe(true);
  });
});

describe("Tavily search contributes a fact", () => {
  it("a pending 2027 rate gets the cabinet's status from a page found by search, with quotes checked", async () => {
    const r = await run(byId("tw-2027-pending").input);
    const mw = r.rules.find((x) => x.key === "tw.min_wage_hourly" && x.value === 205)!;
    expect(mw.status).toBe("cabinet_announced");
    expect(mw.statusDate).toBe("2026-10-01");
    const fromSearch = mw.citations.filter((c) => c.foundBy === "search");
    expect(fromSearch.length).toBe(2);
    expect(fromSearch.every((c) => c.verified && c.url.includes("ey.gov.tw"))).toBe(true);
    expect(r.searchNotes?.[0].contributed).toBe(true);
    expect(r.premises.some((p) => p.en.includes("Executive Yuan heard the report"))).toBe(true);
  });
  it("a 2026 check searches but changes nothing and does not read the cabinet page", async () => {
    const r = await run(byId("tw-holiday-unpaid").input);
    expect(r.searchNotes?.[0].contributed).toBe(false);
    expect(r.trace.some((t) => t.name === "fetch_official" && t.detail.includes("found by search"))).toBe(false);
  });
});

describe("model parse guard", () => {
  it("keeps a break written in the line when the model drops it", async () => {
    const c = byId("ho-tw-dragon-boat-2027");
    // A stand-in for Nano that reads the shifts but drops the 1-hour break on 6/9 (what happened in the live eval).
    const nano = (opts: { jsonMode?: boolean }) =>
      opts.jsonMode
        ? {
            text: JSON.stringify({
              shifts: [
                { date: "2027-06-08", start: "17:00", end: "21:00", break_minutes: 0 },
                { date: "2027-06-09", start: "11:00", end: "19:00", break_minutes: 0 },
              ],
              payslip: {},
            }),
          }
        : null;
    const script = rulesMockScript();
    const llm = new MockProvider((m, o) => nano(o) ?? script(m, o));
    Object.defineProperty(llm, "kind", { value: "nebius" }); // take the live path (model parse)
    const r = await runFairShift(c.input, { llm, search: new FixtureSearchProvider(fixtures as FixtureSet), mode: "mock", modeNote: "t", today: "2026-10-14" });
    expect(r.trace.some((t) => t.name === "break_kept")).toBe(true);
    expect(r.computation.expectedTotal).toBe(c.expected.expectedTotal);
  });
});

describe("fewer model turns", () => {
  it("prefetches the seed pages once and ends the loop when every rule is recorded", async () => {
    const r = await run(byId("tw-holiday-unpaid").input);
    const agentTurns = r.trace.filter((t) => t.name === "agent").length;
    expect(agentTurns).toBe(4); // two loops in parallel, each: fetch_pages, then record_rules; no "finish" turns
    expect(r.trace.some((t) => t.name === "auto_finish")).toBe(true);
    const fetched = r.trace.filter((t) => t.name === "fetch_official").map((t) => t.detail);
    expect(new Set(fetched).size).toBe(fetched.length); // no page retrieved twice
  });
  it("shares one retrieval between a prefetch and the agent's fetch", async () => {
    let calls = 0;
    const search = new FixtureSearchProvider(fixtures as FixtureSet);
    const counting = { kind: search.kind, search: search.search.bind(search), extract: async (u: string) => (calls++, search.extract(u)) };
    const s = new AgentSession({ llm: new MockProvider(), search: counting });
    const url = "https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/";
    await Promise.all([s.prefetch([url]), s.fetchOfficial(url)]);
    await s.fetchOfficial(url);
    expect(calls).toBe(1);
  });
});

describe("words on the page", () => {
  it("English holiday names, Chinese sample titles, and an employer message in both languages", async () => {
    expect(holidayNameEn("國慶日")).toBe("National Day (國慶日)");
    expect(SAMPLE_CASES.every((c) => !!c.titleZh)).toBe(true);
    const r = await run(byId("tw-holiday-unpaid").input);
    expect(r.explanation.messageLang).toBe("zh");
    expect(r.explanation.messageTranslation).toContain("I checked my schedule");
    expect(r.explanation.text).toContain("may be owed");
    expect(r.explanation.textZh).toContain("可能少領了");
    const ny = await run(byId("ny-tipped-overtime").input);
    expect(ny.computation.lines.every((l) => !!l.labelZh)).toBe(true);
    expect(ny.computation.assumptionsZh.every((a) => /[㐀-鿿]/.test(a))).toBe(true);
  });
  it("a sample is matched only while its text is unchanged", () => {
    const c = SAMPLE_CASES[0];
    expect(matchSample(c.id, c.input)?.id).toBe(c.id);
    expect(matchSample(c.id, { ...c.input, scheduleText: c.input.scheduleText + "\n10/30 17:00-22:00" })).toBeUndefined();
    expect(matchSample("ho-tw-labor-day-2026", HELDOUT_CASES[1].input)).toBeUndefined(); // held-out cases are not samples
  });
  it("saved results are only served when the file has them, labelled with the reason", () => {
    const r = precomputedFor(SAMPLE_CASES[0].id, "limit");
    if (r) expect(r.precomputed?.en).toContain("daily limit");
    else expect(r).toBeUndefined();
  });
});

describe("public demo caps", () => {
  it("README states the same caps as the code defaults and the Vercel environment", () => {
    const L = limits();
    const readme = readFileSync("README.md", "utf8");
    const caps = readme.slice(readme.indexOf("## Public demo caps"), readme.indexOf("## NVIDIA models"));
    expect(caps).toContain(`| Checks per day, all visitors | ${L.globalRunsPerDay} per server instance |`);
    expect(caps).toContain(`| Model spend per day | US$${L.globalUsdPerDay} per instance;`);
    expect(caps).toContain(`| Tavily credits per day | ${L.globalTavilyCreditsPerDay} per instance |`);
    expect(L).toMatchObject({ globalRunsPerDay: 60, globalUsdPerDay: 1.5, globalTavilyCreditsPerDay: 32 });
    // README states the measured cost of a fresh check and the cold checks per day it allows.
    expect(caps).toContain(`at least ${Math.floor(L.globalTavilyCreditsPerDay / TAVILY_CREDITS_PER_COLD_CHECK)} fresh checks per instance`);
  });
});
