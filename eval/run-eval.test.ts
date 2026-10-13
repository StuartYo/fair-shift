import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/official-pages.json";
import { currentMode, modeNote } from "../lib/config";
import { getProviders } from "../lib/providers";
import type { FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { runFairShift } from "../lib/wage/run";
import { runBaseline, scoreBaseline, type BaselineResult, type Score } from "./baseline";
import { EVAL_CASES } from "./cases";

// npm run eval
// Live (both keys set): runs Fair Shift and the pure-model baseline on every
// case and writes eval/results/<time>.json. Without keys: runs Fair Shift in
// demo mode and marks the baseline as skipped (never faked).

describe("Fair Shift vs pure-model baseline", () => {
  it("runs every case", { timeout: 15 * 60_000 }, async () => {
    const mode = currentMode();
    const rows: Record<string, unknown>[] = [];
    let sysCorrect = 0;
    let baseCorrect = 0;
    let baseMw = 0;
    for (const c of EVAL_CASES) {
      const p = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });
      const r = await runFairShift(c.input, { llm: p.llm, search: p.search, mode: p.mode, modeNote: p.modeNote });
      const tol = c.input.jurisdiction === "TW" ? 1 : 0.01;
      const ok = Math.abs(r.computation.expectedTotal - c.expected.expectedTotal) <= tol;
      if (ok) sysCorrect++;
      let base: BaselineResult | null = null;
      let score: Score | null = null;
      if (mode === "live") {
        base = await runBaseline(p.llm, c);
        score = await scoreBaseline(c, base, p.search);
        if (score.amountCorrect) baseCorrect++;
        if (score.minWageCorrect) baseMw++;
      }
      rows.push({
        case: c.id,
        truth: c.expected.expectedTotal,
        fairShift: r.computation.expectedTotal,
        fairShiftCorrect: ok,
        fairShiftCostUsd: r.usage.estCostUsd,
        fairShiftModels: r.modelsUsed,
        agentRecorded: r.rules.filter((x) => x.recordedBy === "agent").length,
        codeFallback: r.rules.filter((x) => x.recordedBy === "code_fallback").length,
        baseline: base ?? "skipped: needs NEBIUS_API_KEY and TAVILY_API_KEY",
        baselineScore: score,
      });
    }
    const summary = {
      mode,
      modeNote: modeNote(mode),
      ranAt: new Date().toISOString(),
      cases: EVAL_CASES.length,
      fairShiftAmountCorrect: sysCorrect,
      baselineAmountCorrect: mode === "live" ? baseCorrect : null,
      baselineMinWageCorrect: mode === "live" ? baseMw : null,
    };
    mkdirSync("eval/results", { recursive: true });
    const file = `eval/results/${mode}-${summary.ranAt.replace(/[:.]/g, "-")}.json`;
    writeFileSync(file, JSON.stringify({ summary, rows }, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    console.table(rows.map((r) => ({ case: r.case, truth: r.truth, fairShift: r.fairShift, ok: r.fairShiftCorrect, baseline: (r.baselineScore as Score | null)?.amountCorrect ?? "skipped" })));
    expect(sysCorrect).toBe(EVAL_CASES.length);
  });
});
