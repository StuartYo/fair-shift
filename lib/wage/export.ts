import { NY_JOB_LABEL, NY_REGION_LABEL, specByKey } from "./catalog";
import type { FairShiftReport, HolidayRecord, PayLine, RuleKey, RuleRecord } from "./types";

// Plain formatting helpers shared by the UI and the Markdown export.

const FRACTIONS: [number, string][] = [
  [4 / 3, "4/3"],
  [5 / 3, "5/3"],
  [1.5, "1.5"],
  [2, "2"],
  [1, "1"],
];

export function fmtMultiplier(v: number): string {
  const f = FRACTIONS.find(([n]) => Math.abs(n - v) < 1e-6);
  return `x${f ? f[1] : v.toFixed(3)}`;
}

export function fmtMoney(n: number, currency: "TWD" | "USD", exact = false): string {
  if (currency === "TWD") return `NT$${(exact ? Math.round(n * 100) / 100 : Math.round(n)).toLocaleString("en-US")}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "x1.5" or, for a tipped line, "x1.5 minus $5.65". */
export function fmtLineRate(l: PayLine, currency: "TWD" | "USD"): string {
  const m = fmtMultiplier(l.multiplier);
  return l.deduction ? `${m} minus ${fmtMoney(l.deduction, currency, true)}` : m;
}

export function ruleValueText(r: RuleRecord, currency: "TWD" | "USD"): string {
  const spec = specByKey(r.key);
  if (spec?.kind === "hours_limit") return `${r.value} hours`;
  if (r.key === "ny.tip_credit") return `up to ${fmtMoney(r.value, currency, true)} per hour`;
  return spec?.kind === "amount" ? `${fmtMoney(r.value, currency, true)} per hour` : fmtMultiplier(r.value);
}

export function holidayLabel(h: HolidayRecord): string {
  return h.date ?? h.monthDay;
}

// Plain reasons for the verdict, in priority order. A pay line belongs to the
// first group that lists one of its rules.
const WHY: { keys: RuleKey[]; text: string }[] = [
  { keys: ["tw.holiday"], text: "Work on a national holiday is paid double" },
  { keys: ["tw.day_off"], text: "Work on the regular day off is paid double" },
  { keys: ["tw.rest_first2", "tw.rest_after2"], text: "Rest day work is paid 4/3 for the first 2 hours, then 5/3" },
  { keys: ["tw.weekly_hours"], text: "Hours over 40 in a week are overtime, paid 4/3 for the first 2 hours of the day, then 5/3" },
  { keys: ["tw.ot_first2", "tw.ot_next2"], text: "Hours over 8 in a day are overtime, paid 4/3, then 5/3" },
  { keys: ["ny.ot_tipped"], text: "Tipped overtime is 1.5 times the full minimum wage, minus the tip credit" },
  { keys: ["ny.ot_weekly"], text: "Hours over 40 in a week are paid 1.5 times" },
  { keys: ["ny.spread_hosp", "ny.spread_misc"], text: "A workday that spans more than 10 hours earns one extra hour at the minimum wage" },
];

/** Why the expected pay is what it is: extra pay the rules require, plus minimum wage and unpaid hours findings. */
export function whyLines(r: FairShiftReport): { text: string; amount?: number }[] {
  const c = r.computation;
  const sums = new Map<string, number>();
  for (const l of c.lines) {
    const extra = l.label.startsWith("Spread") ? l.amount : l.amount - l.hours * (l.baseRate - (l.deduction ?? 0));
    if (extra <= 0.005) continue;
    const g = WHY.find((w) => w.keys.some((k) => l.ruleKeys.includes(k)));
    if (g) sums.set(g.text, (sums.get(g.text) ?? 0) + extra);
  }
  const out: { text: string; amount?: number }[] = WHY.filter((w) => sums.has(w.text)).map((w) => ({ text: w.text, amount: sums.get(w.text) }));
  for (const p of c.problems) if (p.kind === "below_min_wage" || p.kind === "unpaid_hours") out.push({ text: p.message.replace(/\.$/, ""), amount: p.amount });
  return out;
}

export function toMarkdown(r: FairShiftReport): string {
  const c = r.computation;
  const cur = c.currency;
  const where =
    r.input.jurisdiction === "TW"
      ? "Taiwan"
      : `New York (${NY_REGION_LABEL[r.input.nyRegion ?? "nyc"]}; ${NY_JOB_LABEL[r.input.nyJob ?? "general"]})`;
  const out: string[] = [];
  out.push(`# Fair Shift pay check`, ``, `- Jurisdiction: ${where}`, `- Checked: ${r.createdAt}`, `- Mode: ${r.modeNote}`, ``);
  out.push(`## Result`, ``, `| | Amount |`, `|---|---|`, `| Expected | ${fmtMoney(c.expectedTotal, cur)} |`);
  if (c.paidTotal !== undefined) out.push(`| Paid | ${fmtMoney(c.paidTotal, cur)} |`);
  if (c.shortfall !== undefined) out.push(`| Difference | ${fmtMoney(c.shortfall, cur)} |`);
  out.push(``, `## Lines`, ``, `| Date | Item | Hours | Rate | Multiplier | Amount |`, `|---|---|---|---|---|---|`);
  for (const l of c.lines)
    out.push(`| ${l.date} | ${l.label} | ${l.hours} | ${fmtMoney(l.baseRate, cur, true)} | ${fmtLineRate(l, cur)} | ${fmtMoney(l.amount, cur, true)} |`);
  out.push(``, `## Official rules used`, ``);
  for (const rule of r.rules) {
    const spec = specByKey(rule.key);
    out.push(`### ${spec?.label ?? rule.key}: ${ruleValueText(rule, cur)}${rule.effectiveFrom ? `, from ${rule.effectiveFrom}` : ""}${rule.status === "pending_approval" ? " (pending approval)" : ""}`);
    for (const ci of rule.citations) out.push(``, `> ${ci.quote}`, ``, `Source: [${ci.title}](${ci.url})`);
    out.push(``);
  }
  for (const h of r.holidays) {
    out.push(`### Holiday: ${h.name} (${holidayLabel(h)})`);
    for (const ci of h.citations) out.push(``, `> ${ci.quote}`, ``, `Source: [${ci.title}](${ci.url})`);
    if (h.dateSource) out.push(``, `Date: ${h.dateSource.note} Source: [${h.dateSource.title}](${h.dateSource.url})`);
    out.push(``);
  }
  if (c.problems.length) out.push(`## Findings`, ``, ...c.problems.map((p) => `- ${p.message}`), ``);
  if (c.assumptions.length) out.push(`## Assumptions`, ``, ...c.assumptions.map((a) => `- ${a}`), ``);
  out.push(`## Message to employer`, ``, r.explanation.messageToEmployer, ``, `---`, r.disclaimer);
  return out.join("\n");
}
