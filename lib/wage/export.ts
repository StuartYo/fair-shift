import { NY_REGION_LABEL, specByKey } from "./catalog";
import type { FairShiftReport, RuleRecord } from "./types";

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

export function ruleValueText(r: RuleRecord, currency: "TWD" | "USD"): string {
  const spec = specByKey(r.key);
  return spec?.kind === "amount" ? `${fmtMoney(r.value, currency, true)} per hour` : fmtMultiplier(r.value);
}

export function toMarkdown(r: FairShiftReport): string {
  const c = r.computation;
  const cur = c.currency;
  const where = r.input.jurisdiction === "TW" ? "Taiwan" : `New York (${NY_REGION_LABEL[r.input.nyRegion ?? "nyc"]})`;
  const out: string[] = [];
  out.push(`# Fair Shift pay check`, ``, `- Jurisdiction: ${where}`, `- Checked: ${r.createdAt}`, `- Mode: ${r.modeNote}`, ``);
  out.push(`## Result`, ``, `| | Amount |`, `|---|---|`, `| Expected | ${fmtMoney(c.expectedTotal, cur)} |`);
  if (c.paidTotal !== undefined) out.push(`| Paid | ${fmtMoney(c.paidTotal, cur)} |`);
  if (c.shortfall !== undefined) out.push(`| Difference | ${fmtMoney(c.shortfall, cur)} |`);
  out.push(``, `## Lines`, ``, `| Date | Item | Hours | Rate | Multiplier | Amount |`, `|---|---|---|---|---|---|`);
  for (const l of c.lines) out.push(`| ${l.date} | ${l.label} | ${l.hours} | ${fmtMoney(l.baseRate, cur, true)} | ${fmtMultiplier(l.multiplier)} | ${fmtMoney(l.amount, cur, true)} |`);
  out.push(``, `## Official rules used`, ``);
  for (const rule of r.rules) {
    const spec = specByKey(rule.key);
    out.push(`### ${spec?.label ?? rule.key}: ${ruleValueText(rule, cur)}${rule.effectiveFrom ? `, from ${rule.effectiveFrom}` : ""}${rule.status === "pending_approval" ? " (pending approval)" : ""}`);
    for (const ci of rule.citations) out.push(``, `> ${ci.quote}`, ``, `Source: [${ci.title}](${ci.url})`);
    out.push(``);
  }
  for (const h of r.holidays) {
    out.push(`### Holiday: ${h.name} (${h.monthDay})`);
    for (const ci of h.citations) out.push(``, `> ${ci.quote}`, ``, `Source: [${ci.title}](${ci.url})`);
    out.push(``);
  }
  if (c.problems.length) out.push(`## Findings`, ``, ...c.problems.map((p) => `- ${p.message}`), ``);
  if (c.assumptions.length) out.push(`## Assumptions`, ``, ...c.assumptions.map((a) => `- ${a}`), ``);
  out.push(`## Message to employer`, ``, r.explanation.messageToEmployer, ``, `---`, r.disclaimer);
  return out.join("\n");
}
