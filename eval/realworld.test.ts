import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/official-pages.json";
import { currentMode, modelChain, modeNote, priceForModel } from "../lib/config";
import { getProviders } from "../lib/providers";
import type { FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { minWageFor } from "../lib/wage/compute";
import { flagsOf, runFairShift } from "../lib/wage/run";
import type { CheckInput } from "../lib/wage/types";
import { runBaseline } from "./baseline";
import type { EvalCase } from "./cases";
import { NY_COURT_CHECKS, NY_NOT_USED } from "./realworld/courts-ny";
import { TW_COURT_CHECKS, TW_NOT_USED } from "./realworld/courts-tw";
import { DIAGNOSIS } from "./realworld/diagnosis";
import { POST_CASES } from "./realworld/posts";
import { agreementOf, realworldMarkdown, scoreBaselinePost, scorePost, type CourtRow, type GotShift, type PostRow, type RealworldResult } from "./realworld/report";
import type { CourtCheck } from "./realworld/types";

// npm run eval:realworld
// Live (NEBIUS_API_KEY and TAVILY_API_KEY set): runs Fair Shift and the
// pure-model baseline on the real-world set and writes
// eval/results/realworld-<time>.json and .md (commit these). Without keys it runs
// Fair Shift in demo mode and writes realworld-mock-* (gitignored).
// RW_ONLY=id1,id2 limits the run. RW_MAX_USD caps Nemotron spend (default 1.00).

process.env.TAVILY_CACHE_DIR ??= ".cache/tavily";

const BASELINE_PARSE_SYSTEM = `Extract the work shifts from this text a worker pasted. Reply with JSON only:
{"shifts":[{"date":"MM-DD or null","start":"HH:MM or null","end":"HH:MM or null","hours":number or null}]}
Use 24-hour times. Use null for anything the text does not state; do not guess dates or times. Leave out anything that is not an actual shift.`;

/** The baseline sees the same text plus what was typed in the form. */
function baselineCase(c: CourtCheck): EvalCase {
  const extra = [
    c.input.hourlyRate !== undefined ? `Hourly rate typed in the form: ${c.input.hourlyRate}` : "",
    c.input.restDayWeekday !== undefined ? `Rest day weekday: ${c.input.restDayWeekday}` : "",
  ].filter(Boolean);
  return {
    id: c.id,
    title: c.title,
    input: { ...c.input, payslipText: [c.input.payslipText, ...extra].join("\n") },
    expected: { shifts: 0, workedHours: 0, expectedTotal: 0, paidTotal: 0, shortfall: 0, minWageUsed: 0 },
    why: "",
  };
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

describe("real-world check", () => {
  it("runs every case", { timeout: 120 * 60_000 }, async () => {
    const mode = currentMode();
    const only = (process.env.RW_ONLY || "").split(",").filter(Boolean);
    const maxUsd = Number(process.env.RW_MAX_USD || 1);
    const courts = [...TW_COURT_CHECKS, ...NY_COURT_CHECKS].filter((c) => !only.length || only.includes(c.id));
    const posts = POST_CASES.filter((p) => !only.length || only.includes(p.id));
    const today = new Date().toISOString().slice(0, 10);
    const ranAt = new Date().toISOString();
    const codeCommit = git("rev-parse --short HEAD");
    const dirtyTree = git("status --porcelain -- lib app") !== "";
    const agentModels = new Set<string>();
    let baselineModel: string | undefined;
    let spent = 0;
    let tavily = 0;
    const capCheck = () => {
      if (spent > maxUsd) throw new Error(`real-world eval spend cap reached (US$${spent.toFixed(2)})`);
    };

    // Background baseline jobs, at most 4 at a time; Fair Shift runs one at a time so its timings are clean.
    const pending: Promise<void>[] = [];
    let active = 0;
    const waiters: (() => void)[] = [];
    const slot = async (job: () => Promise<void>) => {
      while (active >= 4) await new Promise<void>((res) => waiters.push(res));
      active++;
      try {
        await job();
      } finally {
        active--;
        waiters.shift()?.();
      }
    };

    const courtRows: CourtRow[] = [];
    for (const c of courts) {
      const p = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });
      const t0 = Date.now();
      const r = await runFairShift(c.input as CheckInput, { llm: p.llm, search: p.search, mode: p.mode, modeNote: p.modeNote });
      const sec = Math.round((Date.now() - t0) / 100) / 10;
      spent += r.usage.estCostUsd;
      tavily += r.usage.tavilyCredits;
      if (mode === "live") r.modelsUsed.forEach((m) => agentModels.add(m));
      const currency = c.input.jurisdiction === "TW" ? "TWD" : "USD";
      const stopped = !!r.needsInput || !!r.parseError;
      const value = stopped ? undefined : c.court.compare === "expectedTotal" ? r.computation.expectedTotal : r.computation.shortfall;
      const a = agreementOf(value, c.court.figure, currency);
      const lastDate = r.shifts.map((s) => s.date).sort().at(-1) ?? "";
      const row: CourtRow = {
        id: c.id,
        title: c.title,
        jurisdiction: c.input.jurisdiction,
        currency,
        caseNo: c.source.caseNo,
        url: c.source.url,
        courtFigure: c.court.figure,
        compare: c.court.compare,
        expectedDifferences: c.expectedDifferences,
        fairShift: {
          value,
          diff: a.diff,
          agreement: a.agreement,
          expectedTotal: r.computation.expectedTotal,
          shortfall: r.computation.shortfall,
          paidTotal: r.computation.paidTotal,
          needsInput: r.needsInput?.kind,
          parseError: !!r.parseError || undefined,
          shifts: r.shifts.filter((s) => !s.continuesFrom).length,
          hours: r.computation.workedHours,
          confidence: r.parse.confidence,
          flags: flagsOf(r),
          holidayDates: r.shifts.filter((s) => s.dayType === "holiday").map((s) => s.date),
          restDayDates: r.shifts.filter((s) => s.dayType === "rest_day" || s.dayType === "regular_day_off").map((s) => `${s.date} ${s.dayType}`),
          minWageUsed: minWageFor(r.rules, lastDate, c.input.nyRegion)?.value,
          missingRules: r.computation.problems.filter((x) => x.kind === "missing_rule").flatMap((x) => x.ruleKeys),
          problems: r.computation.problems.map((x) => ({ id: x.id, kind: x.kind, message: x.message.slice(0, 240) })),
          alternatives: (r.alternatives ?? []).map((x) => ({ id: x.id, expectedTotal: x.expectedTotal, shortfall: x.shortfall })),
          agentRecorded: r.recordedBy.agentRules + r.recordedBy.agentHolidays,
          codeFallback: r.recordedBy.fallbackRules + r.recordedBy.fallbackHolidays,
          costUsd: r.usage.estCostUsd,
          tavilyCredits: r.usage.tavilyCredits,
          sec,
        },
        baseline: null,
      };
      courtRows.push(row);
      console.log(`${c.id}: court ${c.court.figure}, Fair Shift ${value ?? `no amount (${r.needsInput?.kind ?? "no shift"})`} -> ${a.agreement}; Tavily ${r.usage.tavilyCredits}; spent US$${spent.toFixed(3)}`);
      if (mode === "live") {
        const llm = p.llm;
        pending.push(
          slot(async () => {
            const b = await runBaseline(llm, baselineCase(c), today);
            spent += b.costUsd;
            baselineModel = baselineModel ?? (b.model || undefined);
            const bv = b.error ? undefined : c.court.compare === "expectedTotal" ? b.expectedTotal : b.shortfall;
            const ba = agreementOf(bv, c.court.figure, currency);
            row.baseline = { value: bv, diff: ba.diff, agreement: ba.agreement, expectedTotal: b.expectedTotal, shortfall: b.shortfall, minWageUsed: b.minWageUsed, costUsd: b.costUsd, error: b.error };
            console.log(`  baseline ${c.id}: ${bv ?? b.error} -> ${ba.agreement}`);
          }),
        );
      }
      capCheck();
    }

    const postRows: PostRow[] = [];
    for (const pc of posts) {
      const p = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });
      const t0 = Date.now();
      const r = await runFairShift(
        { jurisdiction: "TW", scheduleText: pc.scheduleText, payslipText: pc.payslipText, hourlyRate: pc.hourlyRate },
        { llm: p.llm, search: p.search, mode: p.mode, modeNote: p.modeNote },
      );
      const sec = Math.round((Date.now() - t0) / 100) / 10;
      spent += r.usage.estCostUsd;
      tavily += r.usage.tavilyCredits;
      if (mode === "live") r.modelsUsed.forEach((m) => agentModels.add(m));
      const got: GotShift[] = r.shifts.filter((s) => !s.continuesFrom).map((s) => ({ md: s.date.slice(5), start: s.start, end: s.end, hours: s.hours }));
      const flagged = !!r.parseError || r.parse.confidence === "low" || r.parse.unread.length > 0;
      const row: PostRow = {
        id: pc.id,
        kind: pc.kind,
        expected: pc.expected,
        fairShift: { shifts: got, parseError: !!r.parseError, confidence: r.parse.confidence, unread: r.parse.unread.length, outcome: scorePost(pc.expected, got, flagged), costUsd: r.usage.estCostUsd, sec },
        baseline: null,
      };
      postRows.push(row);
      console.log(`${pc.id}: ${row.fairShift.outcome} (${got.length} shifts, ${r.parse.confidence}); spent US$${spent.toFixed(3)}`);
      if (mode === "live") {
        const llm = p.llm;
        pending.push(
          slot(async () => {
            try {
              const res = await llm.chat(
                modelChain("super"),
                [
                  { role: "system", content: BASELINE_PARSE_SYSTEM },
                  { role: "user", content: `Today's date: ${today}\n\nTEXT:\n${pc.scheduleText}\n\n${pc.payslipText}` },
                ],
                { jsonMode: true, maxTokens: 8000, temperature: 0 },
              );
              const [pin, pout] = priceForModel(res.model);
              const cost = (res.promptTokens * pin + res.completionTokens * pout) / 1_000_000;
              spent += cost;
              const txt = (res.message.content || "").replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
              const j = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)) as { shifts?: unknown[] };
              const rows = (Array.isArray(j.shifts) ? j.shifts : []).map((x) => {
                const o = (x || {}) as Record<string, unknown>;
                const str = (v: unknown) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim() : null);
                const md = str(o.date);
                return {
                  md: md ? md.replace(/^(\d{4}-)?(\d{1,2})[-/](\d{1,2})$/, (_, _y, m, d) => `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`) : null,
                  start: str(o.start),
                  end: str(o.end),
                  hours: typeof o.hours === "number" ? o.hours : null,
                };
              });
              row.baseline = { shifts: rows, outcome: scoreBaselinePost(pc.expected, rows), costUsd: cost };
            } catch (e) {
              row.baseline = { shifts: [], outcome: "wrong", costUsd: 0, error: (e as Error).message.slice(0, 120) };
            }
          }),
        );
      }
      capCheck();
    }
    await Promise.all(pending);
    capCheck();

    const result: RealworldResult = {
      summary: {
        mode,
        modeNote: modeNote(mode),
        ranAt,
        codeCommit,
        dirtyTree,
        models: { agent: [...agentModels], baseline: baselineModel },
        costUsd: Math.round(spent * 10000) / 10000,
        tavilyCredits: Math.round(tavily * 100) / 100,
        notUsed: { tw: TW_NOT_USED.length, ny: NY_NOT_USED.length, twRead: TW_NOT_USED.length + new Set(TW_COURT_CHECKS.map((c) => c.source.caseNo)).size, nyRead: NY_NOT_USED.length + new Set(NY_COURT_CHECKS.map((c) => c.source.caseNo)).size },
        judgments: { tw: new Set(TW_COURT_CHECKS.map((c) => c.source.caseNo)).size, ny: new Set(NY_COURT_CHECKS.map((c) => c.source.caseNo)).size },
      },
      courts: courtRows,
      posts: postRows,
    };
    mkdirSync("eval/results", { recursive: true });
    const label = mode === "live" && !only.length ? "realworld" : `realworld-${mode === "live" ? "partial" : "mock"}`;
    const stem = `eval/results/${label}-${ranAt.replace(/[:.]/g, "-")}`;
    writeFileSync(`${stem}.json`, JSON.stringify(result, null, 2));
    const stemName = stem.split("/").at(-1)!;
    writeFileSync(`${stem}.md`, realworldMarkdown(stemName, result, DIAGNOSIS[stemName]));
    console.log(`\nWrote ${stem}.json and .md; spent about US$${spent.toFixed(3)}, Tavily ${tavily.toFixed(1)} credits`);
    expect(courtRows.length + postRows.length).toBe(courts.length + posts.length);
  });
});
