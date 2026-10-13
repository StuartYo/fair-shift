// Turns an eval run into the comparison tables used in the README, the Devpost
// write-up and the demo video. Pure formatting: no network, unit-tested.

export interface EvalRow {
  case: string;
  title: string;
  currency: "TWD" | "USD";
  truth: number;
  truthShortfall: number;
  truthMinWage: number;
  fairShift: number;
  fairShiftShortfall?: number;
  fairShiftCorrect: boolean;
  fairShiftMinWage?: number;
  fairShiftCitations: number;
  fairShiftCostUsd: number;
  agentRecorded: number;
  codeFallback: number;
  baseline: null | {
    model: string;
    expectedTotal?: number;
    shortfall?: number;
    minWageUsed?: number;
    amountCorrect: boolean;
    shortfallCorrect: boolean;
    minWageCorrect: boolean;
    sourcesGiven: number;
    sourcesVerified: number;
    costUsd: number;
    error?: string;
  };
}

export interface EvalSummary {
  mode: "live" | "mock";
  modeNote: string;
  ranAt: string;
  cases: number;
  models: { agent: string[]; baseline?: string };
}

const money = (n: number | undefined, c: "TWD" | "USD") =>
  n === undefined || !Number.isFinite(n) ? "no answer" : c === "TWD" ? `NT$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`;
const mark = (ok: boolean) => (ok ? "correct" : "wrong");
const pct = (a: number, b: number) => (b === 0 ? "n/a" : `${Math.round((a / b) * 100)}%`);

/** Headline numbers for the video and the top of the README. */
export function headlineTable(s: EvalSummary, rows: EvalRow[]): string {
  const n = rows.length;
  const fsOk = rows.filter((r) => r.fairShiftCorrect).length;
  const fsShort = rows.filter((r) => r.fairShiftShortfall !== undefined && Math.abs(r.fairShiftShortfall - r.truthShortfall) <= (r.currency === "TWD" ? 1 : 0.01)).length;
  const fsMw = rows.filter((r) => r.fairShiftMinWage === r.truthMinWage).length;
  const fsCost = rows.reduce((a, r) => a + r.fairShiftCostUsd, 0) / Math.max(1, n);
  const b = rows.map((r) => r.baseline).filter((x): x is NonNullable<EvalRow["baseline"]> => !!x);
  const baseCol = (f: (x: NonNullable<EvalRow["baseline"]>[]) => string) => (b.length === n ? f(b) : "pending (needs API keys)");
  const given = b.reduce((a, x) => a + x.sourcesGiven, 0);
  const verified = b.reduce((a, x) => a + x.sourcesVerified, 0);
  const lines = [
    `| ${n} synthetic cases | Fair Shift (agent + Tavily + code math) | Same Nemotron model alone (no tools) |`,
    `|---|---|---|`,
    `| Expected pay exactly right | ${fsOk}/${n} | ${baseCol((x) => `${x.filter((y) => y.amountCorrect).length}/${n}`)} |`,
    `| Underpaid amount exactly right | ${fsShort}/${n} | ${baseCol((x) => `${x.filter((y) => y.shortfallCorrect).length}/${n}`)} |`,
    `| Used the minimum wage in force on the shift dates | ${fsMw}/${n} | ${baseCol((x) => `${x.filter((y) => y.minWageCorrect).length}/${n}`)} |`,
    `| Cited sources that contain the number used | ${rows.reduce((a, r) => a + r.fairShiftCitations, 0)} quotes, all checked verbatim | ${baseCol(() => `${verified} of ${given} (${pct(verified, given)})`)} |`,
    `| Average model cost per check | ${s.mode === "live" ? `US$${fsCost.toFixed(4)}` : "n/a (demo mode)"} | ${baseCol((x) => `US$${(x.reduce((a, y) => a + y.costUsd, 0) / n).toFixed(4)}`)} |`,
  ];
  return lines.join("\n");
}

/** One row per case. */
export function caseTable(rows: EvalRow[]): string {
  const out = [
    `| Case | Truth | Fair Shift | Pure model | Pure model min. wage | Truth min. wage |`,
    `|---|---|---|---|---|---|`,
  ];
  for (const r of rows) {
    const b = r.baseline;
    const base = b ? (b.error ? `error: ${b.error.slice(0, 40)}` : `${money(b.expectedTotal, r.currency)} (${mark(b.amountCorrect)})`) : "pending";
    const bmw = b && !b.error ? `${b.minWageUsed ?? "none"} (${mark(b.minWageCorrect)})` : "pending";
    out.push(`| ${r.case} | ${money(r.truth, r.currency)} | ${money(r.fairShift, r.currency)} (${mark(r.fairShiftCorrect)}) | ${base} | ${bmw} | ${r.truthMinWage} |`);
  }
  return out.join("\n");
}

export function evalMarkdown(s: EvalSummary, rows: EvalRow[]): string {
  return [
    `# Fair Shift eval, ${s.ranAt.slice(0, 10)}`,
    ``,
    `- Mode: ${s.modeNote}`,
    `- Agent models: ${s.models.agent.join(", ") || "none (demo mode)"}`,
    `- Pure-model baseline: ${s.models.baseline ?? "not run (needs NEBIUS_API_KEY and TAVILY_API_KEY)"}`,
    `- All cases are synthetic. Truth values are hand-computed from the official rules (see eval/cases.ts).`,
    ``,
    `## Headline`,
    ``,
    headlineTable(s, rows),
    ``,
    `## Per case`,
    ``,
    caseTable(rows),
    ``,
  ].join("\n");
}
