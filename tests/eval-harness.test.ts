import { describe, expect, it } from "vitest";
import { runBaseline, scoreBaseline, baselineUser } from "../eval/baseline";
import { EVAL_CASES } from "../eval/cases";
import { caseTable, evalMarkdown, groupLine, headlineTable, recordedLine, type EvalRow, type EvalSummary } from "../eval/report";
import fixtures from "../fixtures/official-pages.json";
import { MockProvider } from "../lib/llm/mock";
import { FixtureSearchProvider, type FixtureSet } from "../lib/search/fixture";

// The baseline harness must work the moment keys exist. These tests drive it
// with a canned model answer (no network) so parsing, scoring and the tables
// are already proven.

const holiday = EVAL_CASES.find((c) => c.id === "tw-holiday-unpaid")!;

describe("pure-model baseline harness", () => {
  it("gives the model today's date and the same text the agent sees", () => {
    const u = baselineUser(holiday, "2026-10-14");
    expect(u).toContain("Today's date: 2026-10-14");
    expect(u).toContain(holiday.input.scheduleText);
    expect(u).toContain(holiday.input.payslipText);
  });

  it("parses a fenced JSON answer and scores it, checking cited URLs against the source text", async () => {
    // A typical wrong answer: last year's rate, holiday not doubled, one real and one invented URL.
    const answer =
      '```json\n{"min_wage_used": 190, "expected_total": "4,180", "shortfall": -132, "sources": [{"rule": "minimum wage", "url": "https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/"}, {"rule": "holiday", "url": "https://example.com/holiday"}]}\n```';
    const llm = new MockProvider(() => ({ text: answer }));
    const b = await runBaseline(llm, holiday, "2026-10-14");
    expect(b.error).toBeUndefined();
    expect(b).toMatchObject({ minWageUsed: 190, expectedTotal: 4180, shortfall: -132 });
    const s = await scoreBaseline(holiday, b, new FixtureSearchProvider(fixtures as FixtureSet));
    // 190 does appear on the MOL history page (it was the 2025 rate), so that source checks out; the invented one does not.
    expect(s).toEqual({ amountCorrect: false, shortfallCorrect: false, minWageCorrect: false, sourcesVerified: 1, sourcesGiven: 2 });
  });

  it("records a non-JSON answer as an error instead of crashing", async () => {
    const b = await runBaseline(new MockProvider(() => ({ text: "I think about NT$5,000." })), holiday, "2026-10-14");
    expect(b.error).toBeTruthy();
    expect((await scoreBaseline(holiday, b)).amountCorrect).toBe(false);
  });
});

describe("comparison tables", () => {
  const summary = (mode: "live" | "mock"): EvalSummary => ({ mode, modeNote: "test", ranAt: "2026-10-14T00:00:00Z", cases: 2, models: { agent: [] } });
  const row = (over: Partial<EvalRow> = {}): EvalRow => ({
    case: "tw-holiday-unpaid",
    title: "t",
    currency: "TWD",
    truth: 5488,
    truthShortfall: 1176,
    truthMinWage: 196,
    fairShift: 5488,
    fairShiftShortfall: 1176,
    fairShiftCorrect: true,
    fairShiftMinWage: 196,
    fairShiftCitations: 12,
    fairShiftCostUsd: 0.01,
    agentRecorded: 9,
    codeFallback: 0,
    baseline: null,
    ...over,
  });

  it("marks the other columns as not run without keys, never as a number", () => {
    const t = headlineTable(summary("mock"), [row(), row()]);
    expect(t).toContain("| Expected pay exactly right | 2/2 | not run | not run |");
    expect(t).toContain("n/a (demo mode)");
    expect(caseTable([row()])).toContain("| tw-holiday-unpaid | main | NT$5,488 | NT$5,488 (correct) | 9 / 0 | not run | not run | not run | 196 |");
  });

  it("fills the baseline and quote-checks-off columns in live mode", () => {
    const base = { model: "nvidia/nemotron-3-super-120b-a12b", expectedTotal: 4312, shortfall: 0, minWageUsed: 190, amountCorrect: false, shortfallCorrect: false, minWageCorrect: false, sourcesGiven: 2, sourcesVerified: 1, costUsd: 0.0004 };
    const nv = { expectedTotal: 4312, correct: false, costUsd: 0.008, recorded: 5 };
    const rows = [
      row({ baseline: base, noVerify: nv }),
      row({ baseline: { ...base, expectedTotal: 5488, amountCorrect: true, minWageUsed: 196, minWageCorrect: true }, noVerify: { ...nv, expectedTotal: 5488, correct: true }, codeFallback: 2, agentRecorded: 7 }),
    ];
    const t = headlineTable(summary("live"), rows);
    expect(t).toContain("| Expected pay exactly right | 2/2 | 1/2 | 1/2 |");
    expect(t).toContain("| Used the minimum wage in force on the shift dates | 2/2 | n/a | 1/2 |");
    expect(t).toContain("2 of 4 (50%)");
    expect(t).toContain("US$0.0100 | US$0.0080 | US$0.0004 |");
    expect(recordedLine(rows)).toContain("16 made by the agent through its tools, 2 filled by code fallback");
    expect(recordedLine(rows)).toContain("In 1 of 2 cases the agent recorded everything itself.");
    expect(groupLine([row(), row({ group: "heldout", fairShiftCorrect: false })])).toBe("main 1/1, held-out 0/1");
    expect(evalMarkdown(summary("live"), rows)).toContain("## Per case");
  });
});
