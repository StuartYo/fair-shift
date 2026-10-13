import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/official-pages.json";
import { currentMode, liveSearchWithMockModel, modeNote } from "../lib/config";
import { getProviders } from "../lib/providers";
import type { FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { minWageFor } from "../lib/wage/compute";
import { runFairShift } from "../lib/wage/run";
import { runBaseline, scoreBaseline } from "./baseline";
import { EVAL_CASES } from "./cases";
import { HELDOUT_CASES } from "./heldout";
import { evalMarkdown, groupLine, headlineTable, recordedLine, type EvalRow, type EvalSummary } from "./report";

// npm run eval
// Live (both keys set): runs Fair Shift, the same agent with quote checks off,
// and the pure-model baseline on every case (main, messy, held-out), and writes
// eval/results/live-<time>.json and .md (commit these).
// APP_LIVE_SEARCH=1 with only TAVILY_API_KEY: real Tavily retrieval, scripted
// model; writes eval/results/tavily-mockmodel-<time>.* (committed).
// Without keys: runs Fair Shift in demo mode; the other columns say "not run"
// (never faked). Demo results are gitignored.
// EVAL_ONLY=tw-holiday-unpaid,ny-clean limits the run to some cases.
// EVAL_NOVERIFY=0 skips the quote-checks-off column.

// Retrieved pages are cached in .cache/tavily (gitignored) so reruns cost no
// credits. Set TAVILY_CACHE_DIR= (empty) to retrieve everything fresh.
process.env.TAVILY_CACHE_DIR ??= ".cache/tavily";

describe("Fair Shift vs quote checks off vs pure-model baseline", () => {
  it("runs every case", { timeout: 60 * 60_000 }, async () => {
    const mode = currentMode();
    const only = (process.env.EVAL_ONLY || "").split(",").filter(Boolean);
    const all = [...EVAL_CASES, ...HELDOUT_CASES];
    const cases = only.length ? all.filter((c) => only.includes(c.id)) : all;
    const today = new Date().toISOString().slice(0, 10);
    const rows: EvalRow[] = [];
    const agentModels = new Set<string>();
    let baselineModel: string | undefined;
    let spent = 0;
    for (const c of cases) {
      const p = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });
      const r = await runFairShift(c.input, { llm: p.llm, search: p.search, mode: p.mode, modeNote: p.modeNote });
      if (mode === "live") r.modelsUsed.forEach((m) => agentModels.add(m));
      spent += r.usage.estCostUsd;
      const tol = c.input.jurisdiction === "TW" ? 1 : 0.01;
      const lastDate = r.shifts.map((s) => s.date).sort().at(-1) ?? "";
      const row: EvalRow = {
        case: c.id,
        title: c.title,
        group: c.group ?? "main",
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
        agentRecorded: r.recordedBy.agentRules + r.recordedBy.agentHolidays,
        codeFallback: r.recordedBy.fallbackRules + r.recordedBy.fallbackHolidays,
        parseSource: r.parse.source,
        stoppedEarly: r.stoppedEarly,
        noVerify: null,
        baseline: null,
      };
      if (mode === "live" && process.env.EVAL_NOVERIFY !== "0") {
        const p2 = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });
        const r2 = await runFairShift(c.input, { llm: p2.llm, search: p2.search, mode: p2.mode, modeNote: p2.modeNote, verifyRules: false });
        spent += r2.usage.estCostUsd;
        row.noVerify = {
          expectedTotal: r2.computation.expectedTotal,
          correct: Math.abs(r2.computation.expectedTotal - c.expected.expectedTotal) <= tol,
          costUsd: r2.usage.estCostUsd,
          recorded: r2.rules.length + r2.holidays.length,
        };
      }
      if (mode === "live") {
        const b = await runBaseline(p.llm, c, today);
        const s = await scoreBaseline(c, b, p.search);
        spent += b.costUsd;
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
      const guards = r.trace.filter((t) => t.kind === "guard").map((t) => `${t.name}: ${t.detail}`);
      console.log(
        `${c.id}: expected ${r.computation.expectedTotal} (truth ${c.expected.expectedTotal}) agent ${row.agentRecorded} / fallback ${row.codeFallback}, parse ${r.parse.source}, cost so far US$${spent.toFixed(3)}${guards.map((g) => `\n  ${g}`).join("")}`,
      );
      rows.push(row);
      if (spent > Number(process.env.EVAL_MAX_USD || 2)) throw new Error(`eval spend cap reached (US$${spent.toFixed(2)})`);
    }
    const summary: EvalSummary = {
      mode,
      modeNote: modeNote(mode),
      ranAt: new Date().toISOString(),
      cases: rows.length,
      models: { agent: [...agentModels], baseline: baselineModel },
    };
    mkdirSync("eval/results", { recursive: true });
    // Mock model + live Tavily is labelled separately and committed (it tests real retrieval).
    const label = mode === "mock" && liveSearchWithMockModel() ? "tavily-mockmodel" : mode;
    const stem = `eval/results/${label}-${summary.ranAt.replace(/[:.]/g, "-")}`;
    writeFileSync(`${stem}.json`, JSON.stringify({ summary, rows }, null, 2));
    writeFileSync(`${stem}.md`, evalMarkdown(summary, rows));
    console.log(`\nWrote ${stem}.json and ${stem}.md\n`);
    console.log(headlineTable(summary, rows));
    console.log(recordedLine(rows));
    console.log(groupLine(rows));
    expect(rows.length).toBe(cases.length);
  });
});
