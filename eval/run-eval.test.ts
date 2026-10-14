import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/official-pages.json";
import { currentMode, liveSearchWithMockModel, modeNote } from "../lib/config";
import { getProviders } from "../lib/providers";
import type { FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { minWageFor } from "../lib/wage/compute";
import { flagsOf, runFairShift } from "../lib/wage/run";
import { runBaseline, scoreBaseline } from "./baseline";
import { EVAL_CASES } from "./cases";
import { HELDOUT_CASES } from "./heldout";
import { REALSTYLE_CASES } from "./realstyle";
import { ROUND3_CASES } from "./round3";
import { SAMPLE_CASES } from "./samples";
import type { FairShiftReport } from "../lib/wage/types";
import { evalMarkdown, groupLine, headlineTable, recordedLine, speedSearchLine, type EvalRow, type EvalSummary } from "./report";

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
    const all = [...EVAL_CASES, ...HELDOUT_CASES, ...REALSTYLE_CASES, ...ROUND3_CASES];
    const saved: Record<string, FairShiftReport> = {};
    const cases = only.length ? all.filter((c) => only.includes(c.id)) : all;
    const today = new Date().toISOString().slice(0, 10);
    const rows: EvalRow[] = [];
    const agentModels = new Set<string>();
    let baselineModel: string | undefined;
    let spent = 0;
    let tavily = 0;
    const git = (cmd: string) => {
      try {
        return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
      } catch {
        return "";
      }
    };
    const codeCommit = git("rev-parse --short HEAD") || undefined;
    const dirtyTree = git("status --porcelain -- lib app") !== "";
    const pending: Promise<void>[] = [];
    let active = 0;
    const waiters: (() => void)[] = [];
    const limit = Number(process.env.EVAL_BASELINE_CONCURRENCY || 4);
    const slot = async (job: () => Promise<void>) => {
      while (active >= limit) await new Promise<void>((res) => waiters.push(res));
      active++;
      try {
        await job();
      } finally {
        active--;
        waiters.shift()?.();
      }
    };
    for (const c of cases) {
      const p = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });
      const t0 = Date.now();
      const r = await runFairShift(c.input, { llm: p.llm, search: p.search, mode: p.mode, modeNote: p.modeNote });
      const sec = (Date.now() - t0) / 1000;
      if (SAMPLE_CASES.some((x) => x.id === c.id)) saved[c.id] = r;
      const ask = c.expected.needsInput;
      if (mode === "live") r.modelsUsed.forEach((m) => agentModels.add(m));
      spent += r.usage.estCostUsd;
      tavily += r.usage.tavilyCredits;
      const tol = c.input.jurisdiction === "TW" ? 1 : 0.01;
      // Cases with expected warnings: right only if the amount is right and exactly those warnings are shown.
      const flags = flagsOf(r);
      const flagsOk = !c.expected.flags || [...flags].sort().join(",") === [...c.expected.flags].sort().join(",");
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
        fairShiftCorrect: ask ? r.needsInput?.kind === ask && r.computation.lines.length === 0 : !r.needsInput && Math.abs(r.computation.expectedTotal - c.expected.expectedTotal) <= tol && flagsOk,
        truthFlags: c.expected.flags,
        fairShiftFlags: c.expected.flags ? flags : undefined,
        fairShiftConfidence: r.parse.confidence,
        truthNeedsInput: ask,
        fairShiftSec: Math.round(sec * 10) / 10,
        searchCalls: r.searchNotes?.length ?? 0,
        searchContributed: !!r.searchNotes?.some((n) => n.contributed),
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
        tavily += r2.usage.tavilyCredits;
        row.noVerify = {
          expectedTotal: r2.computation.expectedTotal,
          correct: ask ? r2.needsInput?.kind === ask : !r2.needsInput && Math.abs(r2.computation.expectedTotal - c.expected.expectedTotal) <= tol,
          costUsd: r2.usage.estCostUsd,
          recorded: r2.rules.length + r2.holidays.length,
        };
      }
      if (mode === "live") {
        // The pure-model baseline is slow (reasoning, up to 16k tokens) and independent of the
        // Fair Shift run, so it runs in the background, at most EVAL_BASELINE_CONCURRENCY at a time.
        // Fair Shift and the quote-checks-off run stay sequential, so their timings are not shared.
        const llm = p.llm;
        const search = p.search;
        pending.push(
          slot(async () => {
            const b = await runBaseline(llm, c, today);
            const s = await scoreBaseline(c, b, search);
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
            console.log(`  baseline ${c.id}: ${b.expectedTotal ?? b.error} (${s.amountCorrect ? "correct" : "wrong"}), cost so far US$${spent.toFixed(3)}`);
          }),
        );
      }
      const guards = r.trace.filter((t) => t.kind === "guard").map((t) => `${t.name}: ${t.detail}`);
      console.log(
        `${c.id}: expected ${r.computation.expectedTotal} (truth ${c.expected.expectedTotal})${c.expected.flags ? ` flags [${flags.join(",")}] (truth [${c.expected.flags.join(",")}])` : ""}, Tavily ${r.usage.tavilyCredits}, agent ${row.agentRecorded} / fallback ${row.codeFallback}, parse ${r.parse.source}, cost so far US$${spent.toFixed(3)}${guards.map((g) => `\n  ${g}`).join("")}`,
      );
      rows.push(row);
      if (spent > Number(process.env.EVAL_MAX_USD || 2)) throw new Error(`eval spend cap reached (US$${spent.toFixed(2)})`);
    }
    await Promise.all(pending);
    if (spent > Number(process.env.EVAL_MAX_USD || 2)) throw new Error(`eval spend cap reached (US$${spent.toFixed(2)})`);
    const summary: EvalSummary = {
      mode,
      modeNote: modeNote(mode),
      ranAt: new Date().toISOString(),
      cases: rows.length,
      models: { agent: [...agentModels], baseline: baselineModel },
      codeCommit,
      dirtyTree,
      costUsd: Math.round(spent * 10000) / 10000,
      tavilyCredits: Math.round(tavily * 100) / 100,
    };
    mkdirSync("eval/results", { recursive: true });
    // Mock model + live Tavily is labelled separately and committed (it tests real retrieval).
    const label = mode === "mock" && liveSearchWithMockModel() ? "tavily-mockmodel" : mode;
    const stem = `eval/results/${label}-${summary.ranAt.replace(/[:.]/g, "-")}`;
    writeFileSync(`${stem}.json`, JSON.stringify({ summary, rows }, null, 2));
    writeFileSync(`${stem}.md`, evalMarkdown(summary, rows));
    // Live results for the page samples: served (labelled) when the public demo is capped or a run fails.
    if (mode === "live" && !only.length) {
      const pre = JSON.parse(readFileSync("fixtures/precomputed.json", "utf8"));
      writeFileSync("fixtures/precomputed.json", JSON.stringify({ _note: pre._note, ranAt: summary.ranAt, source: `${stem}.json`, reports: saved }));
    }
    console.log(`\nWrote ${stem}.json and ${stem}.md\n`);
    console.log(headlineTable(summary, rows));
    console.log(recordedLine(rows));
    console.log(groupLine(rows));
    console.log(speedSearchLine(rows));
    expect(rows.length).toBe(cases.length);
  });
});
