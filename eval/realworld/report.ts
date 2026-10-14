import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Diagnosis } from "./diagnosis";
import type { DifferenceKind, ExpectedShift, PostCase } from "./types";

// Scoring and reporting for the real-world eval (npm run eval:realworld).
// Pure functions; the runner is eval/realworld.test.ts.

export type Agreement = "exact" | "within_tolerance" | "within_5pct" | "off" | "no_amount";
export const AGREEMENTS: Agreement[] = ["exact", "within_tolerance", "within_5pct", "off", "no_amount"];

export interface CourtRow {
  id: string;
  title: string;
  jurisdiction: "TW" | "US-NY";
  currency: "TWD" | "USD";
  caseNo: string;
  url: string;
  courtFigure: number;
  compare: "shortfall" | "expectedTotal";
  expectedDifferences: { kind: DifferenceKind; note: string }[];
  fairShift: {
    value?: number;
    diff?: number;
    agreement: Agreement;
    expectedTotal: number;
    shortfall?: number;
    paidTotal?: number;
    needsInput?: string;
    parseError?: boolean;
    shifts: number;
    hours: number;
    confidence: "high" | "low";
    flags: string[];
    holidayDates: string[];
    restDayDates: string[];
    minWageUsed?: number;
    missingRules: string[];
    problems: { id?: string; kind: string; message: string }[];
    alternatives: { id: string; expectedTotal: number; shortfall?: number }[];
    agentRecorded: number;
    codeFallback: number;
    costUsd: number;
    tavilyCredits: number;
    sec: number;
  };
  baseline: { value?: number; diff?: number; agreement: Agreement; expectedTotal?: number; shortfall?: number; minWageUsed?: number; costUsd: number; error?: string } | null;
}

export interface GotShift {
  md: string;
  start: string;
  end: string;
  hours: number;
}

export type PostOutcome = "correct" | "loud" | "silent_wrong";

export interface PostRow {
  id: string;
  kind: PostCase["kind"];
  expected: PostCase["expected"];
  fairShift: { shifts: GotShift[]; parseError: boolean; confidence: "high" | "low"; unread: number; outcome: PostOutcome; costUsd: number; sec: number };
  baseline: { shifts: { md: string | null; start: string | null; end: string | null; hours: number | null }[]; outcome: "correct" | "wrong"; costUsd: number; error?: string } | null;
}

export interface RealworldSummary {
  mode: "live" | "mock";
  modeNote: string;
  ranAt: string;
  codeCommit: string;
  dirtyTree: boolean;
  models: { agent: string[]; baseline?: string };
  costUsd: number;
  tavilyCredits: number;
  notUsed: { tw: number; ny: number; twRead: number; nyRead: number };
  judgments: { tw: number; ny: number };
}

export interface RealworldResult {
  summary: RealworldSummary;
  courts: CourtRow[];
  posts: PostRow[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Agreement of a computed amount with the court's figure. Tolerance: NT$1 or $0.01. */
export function agreementOf(value: number | undefined, figure: number, currency: "TWD" | "USD"): { agreement: Agreement; diff?: number } {
  if (value === undefined || value === null || !Number.isFinite(value)) return { agreement: "no_amount" };
  const diff = round2(value - figure);
  const a = Math.abs(diff);
  if (a < 0.005) return { agreement: "exact", diff };
  if (a <= (currency === "TWD" ? 1 : 0.01) + 1e-9) return { agreement: "within_tolerance", diff };
  if (a <= 0.05 * figure + 1e-9) return { agreement: "within_5pct", diff };
  return { agreement: "off", diff };
}

const spanHours = (start: string, end: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let d = m(end) - m(start);
  if (d <= 0) d += 1440;
  return d / 60;
};

function matchOne(e: ExpectedShift, g: GotShift): boolean {
  if (g.md !== e.md) return false;
  if (e.start && e.end) return g.start === e.start && g.end === e.end;
  if (typeof e.hours === "number") return Math.abs(g.hours - e.hours) < 0.01 || Math.abs(spanHours(g.start, g.end) - e.hours) < 0.01;
  return true;
}

/** Same shifts, one to one. */
export function shiftsMatch(expected: ExpectedShift[], got: GotShift[]): boolean {
  if (expected.length !== got.length) return false;
  const used = new Set<number>();
  for (const e of expected) {
    const i = got.findIndex((g, k) => !used.has(k) && matchOne(e, g));
    if (i < 0) return false;
    used.add(i);
  }
  return true;
}

/**
 * correct: the right shifts (or, when no shift can be read, none).
 * loud: wrong or missing, but the result says so (no shift read, low confidence, or unread lines listed).
 * silent_wrong: wrong shifts shown with high confidence and no warning.
 */
export function scorePost(expected: PostCase["expected"], got: GotShift[], flagged: boolean): PostOutcome {
  if (expected.outcome === "ask") return got.length === 0 ? "correct" : flagged ? "loud" : "silent_wrong";
  if (shiftsMatch(expected.shifts, got)) return "correct";
  return got.length === 0 || flagged ? "loud" : "silent_wrong";
}

/** The same Nemotron model alone, asked to list shifts. Entries without a date are not shifts. */
export function scoreBaselinePost(expected: PostCase["expected"], rows: { md: string | null; start: string | null; end: string | null; hours: number | null }[]): "correct" | "wrong" {
  const got: GotShift[] = [];
  for (const r of rows) {
    if (!r.md || !/^\d{2}-\d{2}$/.test(r.md)) continue;
    if (r.start && r.end) got.push({ md: r.md, start: r.start, end: r.end, hours: spanHours(r.start, r.end) });
    else if (typeof r.hours === "number") got.push({ md: r.md, start: "00:00", end: "00:00", hours: r.hours });
  }
  if (expected.outcome === "ask") return got.length === 0 ? "correct" : "wrong";
  return shiftsMatch(expected.shifts, got) ? "correct" : "wrong";
}

// ---- reporting ----

const AGREEMENT_LABEL: Record<Agreement, string> = {
  exact: "Exact",
  within_tolerance: "Within NT$1 / $0.01",
  within_5pct: "Within 5%",
  off: "Off by more than 5%",
  no_amount: "No amount (stopped and asked)",
};

export function countBy<T extends string>(items: T[], keys: readonly T[]): Record<T, number> {
  const out = Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
  for (const i of items) out[i]++;
  return out;
}

const money = (n: number | undefined, currency: "TWD" | "USD") =>
  n === undefined ? "-" : currency === "TWD" ? `NT$${Math.round(n).toLocaleString("en-US")}` : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (n: number | undefined, currency: "TWD" | "USD") => (n === undefined ? "-" : (n > 0 ? "+" : n < 0 ? "-" : "") + money(Math.abs(n), currency));
const shiftText = (s: { md: string; start?: string; end?: string; hours?: number }) => (s.start && s.end ? `${s.md} ${s.start}-${s.end}` : `${s.md} ${s.hours ?? "?"}h`);
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");

export function courtTable(rows: CourtRow[], label: string, pick: (r: CourtRow) => Agreement | undefined): string {
  const lines = [`| ${label} | Taiwan (${rows.filter((r) => r.jurisdiction === "TW").length}) | New York (${rows.filter((r) => r.jurisdiction === "US-NY").length}) | All (${rows.length}) |`, "|---|---|---|---|"];
  const tw = countBy(rows.filter((r) => r.jurisdiction === "TW").map(pick).filter((x): x is Agreement => !!x), AGREEMENTS);
  const ny = countBy(rows.filter((r) => r.jurisdiction === "US-NY").map(pick).filter((x): x is Agreement => !!x), AGREEMENTS);
  for (const a of AGREEMENTS) lines.push(`| ${AGREEMENT_LABEL[a]} | ${tw[a]} | ${ny[a]} | ${tw[a] + ny[a]} |`);
  return lines.join("\n");
}

export function postCounts(rows: PostRow[]) {
  const fs = countBy(rows.map((r) => r.fairShift.outcome), ["correct", "loud", "silent_wrong"] as const);
  const bl = countBy(rows.filter((r) => r.baseline && !r.baseline.error).map((r) => r.baseline!.outcome), ["correct", "wrong"] as const);
  const withShifts = rows.filter((r) => r.expected.outcome === "shifts");
  const ask = rows.filter((r) => r.expected.outcome === "ask");
  return {
    fs,
    bl,
    blRun: rows.filter((r) => r.baseline && !r.baseline.error).length,
    withShifts: withShifts.length,
    withShiftsCorrect: withShifts.filter((r) => r.fairShift.outcome === "correct").length,
    ask: ask.length,
    askCorrect: ask.filter((r) => r.fairShift.outcome === "correct").length,
  };
}

export function realworldMarkdown(stem: string, res: RealworldResult, diagnosis: Record<string, Diagnosis> = {}): string {
  const { summary: s, courts, posts } = res;
  const out: string[] = [];
  out.push(`# Real-world check, ${s.ranAt.slice(0, 10)}`);
  out.push("");
  out.push(`- Run: \`${stem}\` (${s.mode}). ${s.modeNote}`);
  out.push(`- Code under test: commit \`${s.codeCommit}\`${s.dirtyTree ? " plus uncommitted changes" : ""}. Agent models: ${s.models.agent.join(", ") || "-"}. Baseline: ${s.models.baseline ?? "not run"}.`);
  out.push(`- Spend: about US$${s.costUsd.toFixed(3)} in Nemotron calls, ${round2(s.tavilyCredits)} Tavily credits (as the app counts them; cached pages cost 0).`);
  out.push(`- Cases: ${courts.length} court checks from ${s.judgments.tw} Taiwan judgments and ${s.judgments.ny} New York decisions; ${posts.length} public posts. Judgments read and not used: ${s.notUsed.tw} of ${s.notUsed.twRead} Taiwan, ${s.notUsed.ny} of ${s.notUsed.nyRead} New York (reasons in eval/realworld/courts-*.ts).`);
  out.push(`- Expected values were committed before any run (commit "Add real-world eval set with frozen expected values"). Reasons below come from eval/realworld/diagnosis.ts, written after the run; where none is written yet, the reason expected before the run is shown.`);
  out.push("");
  out.push("## Court figures");
  out.push("");
  out.push(courtTable(courts, "Fair Shift vs the court", (r) => r.fairShift.agreement));
  out.push("");
  out.push(courtTable(courts.filter((r) => r.baseline), "Same Nemotron model alone vs the court", (r) => r.baseline?.agreement));
  out.push("");
  out.push("| Case | Court figure | Fair Shift | Difference | Agreement | Model alone | Reason |");
  out.push("|---|---|---|---|---|---|---|");
  for (const r of courts) {
    const d = diagnosis[r.id];
    const fs = r.fairShift;
    const fsCell = fs.agreement === "no_amount" ? `no amount (${fs.needsInput ?? (fs.parseError ? "no shift read" : "none")})` : money(fs.value, r.currency);
    const reason = d ? `${d.category}: ${d.note}` : r.expectedDifferences.length ? `expected before the run: ${r.expectedDifferences.map((x) => x.kind).join(", ")}` : fs.agreement === "exact" || fs.agreement === "within_tolerance" ? "" : "not yet diagnosed";
    const bl = r.baseline ? (r.baseline.error ? `error` : `${money(r.baseline.value, r.currency)} (${AGREEMENT_LABEL[r.baseline.agreement]})`) : "-";
    out.push(`| ${r.id} | ${money(r.courtFigure, r.currency)} | ${fsCell} | ${signed(fs.diff, r.currency)} | ${AGREEMENT_LABEL[fs.agreement]} | ${bl} | ${cell(reason)} |`);
  }
  out.push("");
  out.push("Details per case (Fair Shift):");
  out.push("");
  for (const r of courts) {
    const fs = r.fairShift;
    const bits = [
      `${fs.shifts} shifts, ${round2(fs.hours)} h, parse ${fs.confidence}`,
      `expected ${money(fs.expectedTotal, r.currency)}, paid ${money(fs.paidTotal, r.currency)}`,
      fs.minWageUsed !== undefined ? `minimum wage used ${fs.minWageUsed}` : "minimum wage not found",
      fs.holidayDates.length ? `holidays: ${fs.holidayDates.join(", ")}` : "no holiday",
      fs.restDayDates.length ? `rest days or days off: ${fs.restDayDates.join(", ")}` : "",
      fs.flags.length ? `warnings: ${fs.flags.join(", ")}` : "",
      fs.missingRules.length ? `missing rules: ${fs.missingRules.join(", ")}` : "",
      fs.alternatives.length ? `other reading: ${fs.alternatives.map((a) => `${a.id} ${money(a.shortfall ?? a.expectedTotal, r.currency)}`).join("; ")}` : "",
      `${fs.sec}s, US$${fs.costUsd.toFixed(4)}`,
    ].filter(Boolean);
    out.push(`- ${r.id} (${r.caseNo}): ${bits.join("; ")}.`);
  }
  out.push("");
  out.push("## Messy posts (parsing only)");
  out.push("");
  const pc = postCounts(posts);
  out.push(`| ${posts.length} posts | Fair Shift | Same model alone |`);
  out.push("|---|---|---|");
  const bl = (n: number) => (pc.blRun ? String(n) : "not run");
  out.push(`| Shifts read exactly right (or, when none can be read, none invented) | ${pc.fs.correct} | ${bl(pc.bl.correct)} |`);
  out.push(`| Wrong or missing, but the result says so | ${pc.fs.loud} | n/a |`);
  out.push(`| Wrong, shown with no warning | ${pc.fs.silent_wrong} | ${bl(pc.bl.wrong)} |`);
  if (pc.blRun && pc.blRun < posts.length) out.push(`| Model alone: no usable answer (error) | | ${posts.length - pc.blRun} |`);
  out.push("");
  out.push(`Of these, ${pc.withShifts} posts contain readable shifts (Fair Shift right on ${pc.withShiftsCorrect}) and ${pc.ask} contain none that can be read without guessing (Fair Shift invented none on ${pc.askCorrect}).`);
  out.push("");
  out.push("| Post | Expected | Fair Shift | Outcome | Model alone | Reason |");
  out.push("|---|---|---|---|---|---|");
  for (const p of posts) {
    const exp = p.expected.outcome === "ask" ? "none readable" : p.expected.shifts.map(shiftText).join(", ");
    const got = p.fairShift.parseError ? "no shift read" : `${p.fairShift.shifts.map(shiftText).join(", ") || "none"} (${p.fairShift.confidence}${p.fairShift.unread ? `, ${p.fairShift.unread} unread` : ""})`;
    const d = diagnosis[p.id];
    out.push(`| ${p.id} | ${cell(exp)} | ${cell(got)} | ${p.fairShift.outcome} | ${p.baseline ? (p.baseline.error ? "error" : p.baseline.outcome) : "-"} | ${cell(d ? `${d.category}: ${d.note}` : "")} |`);
  }
  out.push("");
  return out.join("\n");
}

// ---- README block ----

export const RW_START = "<!-- realworld:start (generated by npm run readme from eval/results/realworld-*.json; do not edit by hand) -->";
export const RW_END = "<!-- realworld:end -->";

export function realworldFiles(dir = "eval/results"): { file: string; res: RealworldResult }[] {
  return readdirSync(dir)
    .filter((f) => /^realworld-\d{4}-.*\.json$/.test(f))
    .sort()
    .map((file) => ({ file, res: JSON.parse(readFileSync(join(dir, file), "utf8")) as RealworldResult }))
    .filter((x) => x.res.summary.mode === "live");
}

const within = (rows: CourtRow[], pick: (r: CourtRow) => Agreement | undefined, set: Agreement[]) => rows.filter((r) => set.includes(pick(r) as Agreement)).length;

export function realworldBlock(files: { file: string; res: RealworldResult }[], diagnosis: Record<string, Record<string, Diagnosis>> = {}): string {
  if (!files.length) return [RW_START, "No live real-world run yet.", RW_END].join("\n");
  const first = files[0];
  const last = files[files.length - 1];
  const n = last.res.courts.length;
  const md = (f: string) => `\`eval/results/${f.replace(/\.json$/, ".md")}\``;
  const fsA = (r: CourtRow) => r.fairShift.agreement;
  const blA = (r: CourtRow) => r.baseline?.agreement;
  const row = (label: string, set: Agreement[]) =>
    `| ${label} | ${within(first.res.courts, fsA, set)}/${first.res.courts.length} | ${within(last.res.courts, fsA, set)}/${n} | ${within(last.res.courts, blA, set)}/${n} |`;
  const lines = [RW_START];
  const s = last.res.summary;
  lines.push(
    `Court figures: ${n} checks from ${s.judgments.tw} Taiwan judgments and ${s.judgments.ny} New York decisions (${s.notUsed.tw} of ${s.notUsed.twRead} Taiwan and ${s.notUsed.ny} of ${s.notUsed.nyRead} New York decisions read were not usable). First run on the frozen set: ${md(first.file)} (code \`${first.res.summary.codeCommit}\`). Latest: ${md(last.file)} (code \`${s.codeCommit}\`).`,
  );
  lines.push("");
  lines.push(`| Agreement with the court's own figure | Fair Shift, first run | Fair Shift, latest | Same model alone, latest |`);
  lines.push("|---|---|---|---|");
  lines.push(row("Exact", ["exact"]));
  lines.push(row("Exact or within NT$1 / $0.01", ["exact", "within_tolerance"]));
  lines.push(row("Within 5%", ["exact", "within_tolerance", "within_5pct"]));
  lines.push(row("Off by more than 5%", ["off"]));
  lines.push(row("No amount (stopped and asked)", ["no_amount"]));
  lines.push("");
  const diag = diagnosis[last.file.replace(/\.json$/, "")] ?? {};
  const offRows = last.res.courts.filter((r) => r.fairShift.agreement === "off" || r.fairShift.agreement === "within_5pct" || r.fairShift.agreement === "no_amount");
  const cats = new Map<string, number>();
  for (const r of offRows) {
    const c = diag[r.id]?.category ?? "not diagnosed";
    cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  if (offRows.length)
    lines.push(
      `- Latest run, why the ${offRows.length} checks that are not within NT$1 / $0.01 differ (my diagnosis after the run, eval/realworld/diagnosis.ts): ${[...cats.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([c, k]) => `${c.replace(/_/g, " ")} ${k}`)
        .join(", ")}.`,
    );
  const p1 = postCounts(first.res.posts);
  const p2 = postCounts(last.res.posts);
  lines.push(
    `- ${last.res.posts.length} public posts (PTT), parsing only. Fair Shift read the shifts right (or invented none where none can be read) in ${p1.fs.correct} on the first run and ${p2.fs.correct} on the latest; wrong but flagged ${p1.fs.loud} and ${p2.fs.loud}; wrong with no warning ${p1.fs.silent_wrong} and ${p2.fs.silent_wrong}. The same model alone, asked to list the shifts: ${p2.bl.correct} of ${p2.blRun} right.`,
  );
  lines.push(`- Spend for the latest run: about US$${s.costUsd.toFixed(2)} in Nemotron calls and ${round2(s.tavilyCredits)} Tavily credits.`);
  lines.push(RW_END);
  return lines.join("\n");
}

export function replaceRealworldBlock(readme: string, block: string): string {
  const a = readme.indexOf(RW_START);
  const b = readme.indexOf(RW_END);
  if (a < 0 || b < 0) throw new Error("README has no realworld block markers");
  return readme.slice(0, a) + block + readme.slice(b + RW_END.length);
}
