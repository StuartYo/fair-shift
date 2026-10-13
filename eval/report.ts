// Turns an eval run into the comparison tables used in the README, the Devpost
// write-up and the demo video. Pure formatting: no network, unit-tested.
// tests/readme-numbers.test.ts fails if the README does not show exactly what
// headlineTable() makes from the latest live result file.

export interface EvalRow {
  case: string;
  title: string;
  group?: "main" | "messy" | "heldout" | "realstyle";
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
  /** Rule records the agent made itself (rules + holidays). */
  agentRecorded: number;
  /** Rule records code filled from retrieved text after the agent stopped. */
  codeFallback: number;
  parseSource?: "model" | "rules";
  stoppedEarly?: string;
  /** Same agent and tools, quote checks and code fallback turned off. */
  noVerify?: null | { expectedTotal: number; correct: boolean; costUsd: number; recorded: number };
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
const tolOf = (r: EvalRow) => (r.currency === "TWD" ? 1 : 0.01);

/** Headline numbers for the video and the top of the README. */
export function headlineTable(s: EvalSummary, rows: EvalRow[]): string {
  const n = rows.length;
  const fsOk = rows.filter((r) => r.fairShiftCorrect).length;
  const fsShort = rows.filter((r) => r.fairShiftShortfall !== undefined && Math.abs(r.fairShiftShortfall - r.truthShortfall) <= tolOf(r)).length;
  const fsMw = rows.filter((r) => r.fairShiftMinWage === r.truthMinWage).length;
  const fsCost = rows.reduce((a, r) => a + r.fairShiftCostUsd, 0) / Math.max(1, n);
  const b = rows.map((r) => r.baseline).filter((x): x is NonNullable<EvalRow["baseline"]> => !!x);
  const nv = rows.map((r) => r.noVerify).filter((x): x is NonNullable<EvalRow["noVerify"]> => !!x);
  const baseCol = (f: (x: NonNullable<EvalRow["baseline"]>[]) => string) => (b.length === n ? f(b) : "not run");
  const nvCol = (f: (x: NonNullable<EvalRow["noVerify"]>[]) => string) => (nv.length === n ? f(nv) : "not run");
  const given = b.reduce((a, x) => a + x.sourcesGiven, 0);
  const verified = b.reduce((a, x) => a + x.sourcesVerified, 0);
  const lines = [
    `| ${n} synthetic cases | Fair Shift (agent + Tavily + quote checks + code math) | Same agent and tools, quote checks off | Same Nemotron model alone (no tools) |`,
    `|---|---|---|---|`,
    `| Expected pay exactly right | ${fsOk}/${n} | ${nvCol((x) => `${x.filter((y) => y.correct).length}/${n}`)} | ${baseCol((x) => `${x.filter((y) => y.amountCorrect).length}/${n}`)} |`,
    `| Underpaid amount exactly right | ${fsShort}/${n} | n/a | ${baseCol((x) => `${x.filter((y) => y.shortfallCorrect).length}/${n}`)} |`,
    `| Used the minimum wage in force on the shift dates | ${fsMw}/${n} | n/a | ${baseCol((x) => `${x.filter((y) => y.minWageCorrect).length}/${n}`)} |`,
    `| Cited sources that contain the number used | ${rows.reduce((a, r) => a + r.fairShiftCitations, 0)} quotes, all checked verbatim | not checked | ${baseCol(() => `${verified} of ${given} (${pct(verified, given)})`)} |`,
    `| Average model cost per check | ${s.mode === "live" ? `US$${fsCost.toFixed(4)}` : "n/a (demo mode)"} | ${nvCol((x) => (s.mode === "live" ? `US$${(x.reduce((a, y) => a + y.costUsd, 0) / n).toFixed(4)}` : "n/a (demo mode)"))} | ${baseCol((x) => `US$${(x.reduce((a, y) => a + y.costUsd, 0) / n).toFixed(4)}`)} |`,
  ];
  return lines.join("\n");
}

/** Who recorded the rules: the agent itself, or code from the retrieved text after it stopped. */
export function recordedLine(rows: EvalRow[]): string {
  const agent = rows.reduce((a, r) => a + r.agentRecorded, 0);
  const fb = rows.reduce((a, r) => a + r.codeFallback, 0);
  const allAgent = rows.filter((r) => r.codeFallback === 0).length;
  return `Rule and holiday records: ${agent} made by the agent through its tools, ${fb} filled by code fallback from the retrieved text (${pct(agent, agent + fb)} by the agent). In ${allAgent} of ${rows.length} cases the agent recorded everything itself.`;
}

/** Accuracy per group of cases. */
export function groupLine(rows: EvalRow[]): string {
  const groups: [string, string][] = [
    ["main", "main"],
    ["messy", "messy formats"],
    ["heldout", "held-out"],
  ];
  return groups
    .map(([g, label]) => {
      const rs = rows.filter((r) => (r.group ?? "main") === g);
      return rs.length ? `${label} ${rs.filter((r) => r.fairShiftCorrect).length}/${rs.length}` : "";
    })
    .filter(Boolean)
    .join(", ");
}

/** One row per case. */
export function caseTable(rows: EvalRow[]): string {
  const out = [
    `| Case | Group | Truth | Fair Shift | Agent / fallback records | Quote checks off | Pure model | Pure model min. wage | Truth min. wage |`,
    `|---|---|---|---|---|---|---|---|---|`,
  ];
  for (const r of rows) {
    const b = r.baseline;
    const base = b ? (b.error ? `error: ${b.error.slice(0, 40)}` : `${money(b.expectedTotal, r.currency)} (${mark(b.amountCorrect)})`) : "not run";
    const bmw = b && !b.error ? `${b.minWageUsed ?? "none"} (${mark(b.minWageCorrect)})` : "not run";
    const nv = r.noVerify ? `${money(r.noVerify.expectedTotal, r.currency)} (${mark(r.noVerify.correct)})` : "not run";
    out.push(
      `| ${r.case} | ${r.group ?? "main"} | ${money(r.truth, r.currency)} | ${money(r.fairShift, r.currency)} (${mark(r.fairShiftCorrect)}) | ${r.agentRecorded} / ${r.codeFallback} | ${nv} | ${base} | ${bmw} | ${r.truthMinWage} |`,
    );
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
    `- All cases are synthetic. Truth values are hand-computed by the author from the official rules (method in eval/cases.ts; held-out cases in eval/heldout.ts were committed before this run).`,
    ``,
    `## Headline`,
    ``,
    headlineTable(s, rows),
    ``,
    `- ${recordedLine(rows)}`,
    `- Fair Shift by group: ${groupLine(rows)}.`,
    ``,
    `## Per case`,
    ``,
    caseTable(rows),
    ``,
  ].join("\n");
}
