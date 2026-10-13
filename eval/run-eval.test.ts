import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/official-pages.json";
import { currentMode, modeNote } from "../lib/config";
import { getProviders } from "../lib/providers";
import type { FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { minWageFor } from "../lib/wage/compute";
import { runFairShift } from "../lib/wage/run";
import { runBaseline, scoreBaseline } from "./baseline";
import { EVAL_CASES } from "./cases";
import { evalMarkdown, headlineTable, type EvalRow, type EvalSummary } from "./report";

// npm run eval
// Live (both keys set): runs Fair Shift and the pure-model baseline on every
// case and writes eval/results/live-<time>.json and .md (commit these).
// Without keys: runs Fair Shift in demo mode and marks the baseline as pending
// (never faked). Demo results are gitignored.
// EVAL_ONLY=tw-holiday-unpaid,ny-clean limits the run to some cases.

describe("Fair Shift vs pure-model baseline", () => {
  it("runs every case", { timeout: 20 * 60_000 }, async () => {
    const mode = currentMode();
    const only = (process.env.EVAL_ONLY || "").split(",").filter(Boolean);
    const cases = only.length ? EVAL_CASES.filter((c) => only.includes(c.id)) : EVAL_CASES;
    const today = new Date().toISOString().slice(0, 10);
    const rows: EvalRow[] = [];
    const agentModels = new Set<string>();
    let baselineModel: string | undefined;
    for (const c of cases) {
      const p = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });
      const r = await runFairShift(c.input, { llm: p.llm, search: p.search, mode: p.mode, modeNote: p.modeNote });
      if (mode === "live") r.modelsUsed.forEach((m) => agentModels.add(m));
      const tol = c.input.jurisdiction === "TW" ? 1 : 0.01;
      const lastDate = r.shifts.map((s) => s.date).sort().at(-1) ?? "";
      const row: EvalRow = {
        case: c.id,
        title: c.title,
        currency: r.computation.currency,
        truth: c.expected.expectedTotal,
        truthShortfall: c.expected.shortfall,
        truthMinWage: c.expected.minWageUsed,
        fairShift: r.computation.expectedTotal,
        fairShiftShortfall: r.computation.shortfall,
        fairShiftCorrect: Math.abs(r.computation.expectedTotal - c.expected.expectedTotal) <= tol,
        fairShiftMinWage: minWageFor(r.rules, lastDate, c.input.nyRegion)?.value,
        fairShiftCitations: r.rules.reduce((a, x) => a + x.citations.length, 0) + r.holidays.reduce((a, h) => a + h.citations.length, 0),
        fairShiftCostUsd: r.usage.estCostUsd,
        agentRecorded: r.rules.filter((x) => x.recordedBy === "agent").length,
        codeFallback: r.rules.filter((x) => x.recordedBy === "code_fallback").length,
        baseline: null,
      };
      if (mode === "live") {
        const b = await runBaseline(p.llm, c, today);
        const s = await scoreBaseline(c, b, p.search);
        baselineModel = baselineModel ?? (b.model || undefined);
        row.baseline = {
          model: b.model,
          expectedTotal: b.expectedTotal,
          shortfall: b.shortfall,
          minWageUsed: b.minWageUsed,
          amountCorrect: s.amountCorrect,
          shortfallCorrect: s.shortfallCorrect,
          minWageCorrect: s.minWageCorrect,
          sourcesGiven: s.sourcesGiven,
          sourcesVerified: s.sourcesVerified,
          costUsd: b.costUsd,
          error: b.error,
        };
      }
      rows.push(row);
    }
    const summary: EvalSummary = {
      mode,
      modeNote: modeNote(mode),
      ranAt: new Date().toISOString(),
      cases: rows.length,
      models: { agent: [...agentModels], baseline: baselineModel },
    };
    mkdirSync("eval/results", { recursive: true });
    const stem = `eval/results/${mode}-${summary.ranAt.replace(/[:.]/g, "-")}`;
    writeFileSync(`${stem}.json`, JSON.stringify({ summary, rows }, null, 2));
    writeFileSync(`${stem}.md`, evalMarkdown(summary, rows));
    console.log(`\nWrote ${stem}.json and ${stem}.md\n`);
    console.log(headlineTable(summary, rows));
    expect(rows.filter((r) => r.fairShiftCorrect).length).toBe(rows.length);
  });
});
