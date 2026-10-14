import { NY_JOB_LABEL, NY_REGION_LABEL, specByKey } from "./catalog";
import { holidayNameEn, reasons } from "./explain";
import { citeOf, DISCLAIMER_ZH, lineLabel, lineRuleKeys, multiplierWords, ruleTitle, splitRules, statusWords, type Lang } from "./i18n";
import type { FairShiftReport, HolidayRecord, PayLine, RuleKey, RuleRecord, Shift } from "./types";

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

/** Holiday date with its year: the lunar date, or the shift date it fell on. */
export function holidayLabel(h: HolidayRecord, shifts: Shift[] = []): string {
  return h.date ?? shifts.find((s) => s.date.slice(5) === h.monthDay)?.date ?? h.monthDay;
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

/** Rate column in words: "double", or for a tipped line "time and a half minus $5.65". */
export function lineRateWords(l: PayLine, currency: "TWD" | "USD", lang: Lang): string {
  const m = multiplierWords(l.multiplier, lang);
  if (!l.deduction) return m;
  return lang === "zh" ? `${m}，扣小費抵減 ${fmtMoney(l.deduction, currency, true)}` : `${m} minus ${fmtMoney(l.deduction, currency, true)}`;
}

export function toMarkdown(r: FairShiftReport, lang: Lang = r.input.jurisdiction === "TW" ? "zh" : "en"): string {
  const c = r.computation;
  const cur = c.currency;
  const zh = lang === "zh";
  const where =
    r.input.jurisdiction === "TW"
      ? zh
        ? "台灣"
        : "Taiwan"
      : `New York (${NY_REGION_LABEL[r.input.nyRegion ?? "nyc"]}; ${NY_JOB_LABEL[r.input.nyJob ?? "general"]})`;
  const out: string[] = [];
  out.push(zh ? `# Fair Shift 薪資核對` : `# Fair Shift pay check`, ``, `- ${zh ? "地區" : "Jurisdiction"}: ${where}`, `- ${zh ? "核對時間" : "Checked"}: ${r.createdAt}`, `- ${zh ? "模式" : "Mode"}: ${r.modeNote}`, ``);
  out.push(zh ? `## 結果` : `## Result`, ``, `| | ${zh ? "金額" : "Amount"} |`, `|---|---|`, `| ${zh ? "應領" : "Expected"} | ${fmtMoney(c.expectedTotal, cur)} |`);
  if (c.paidTotal !== undefined) out.push(`| ${zh ? "實領" : "Paid"} | ${fmtMoney(c.paidTotal, cur)} |`);
  if (c.shortfall !== undefined) out.push(`| ${zh ? "差額" : "Difference"} | ${fmtMoney(c.shortfall, cur)} |`);
  if (r.premises.length) out.push(``, zh ? `前提：` : `Depends on:`, ...r.premises.map((p) => `- ${p[lang]}`));
  const rs = reasons(c, r.shifts, r.rules);
  if (rs.length) out.push(``, zh ? `## 原因` : `## Why`, ``, ...rs.map((x) => (zh ? `- ${x.zh}（${x.cite.zh}）` : `- ${x.en} (${x.cite.en})`)));
  out.push(
    ``,
    zh ? `## 逐行計算` : `## Lines`,
    ``,
    zh ? `| 日期 | 項目 | 時數 | 時薪 | 算法 | 金額 | 依據 |` : `| Date | Item | Hours | Rate | Pay rule | Amount | Rule |`,
    `|---|---|---|---|---|---|---|`,
  );
  for (const l of c.lines)
    out.push(
      `| ${l.date} | ${lineLabel(l, lang)} | ${l.hours} | ${fmtMoney(l.baseRate, cur, true)} | ${lineRateWords(l, cur, lang)} | ${fmtMoney(l.amount, cur, true)} | ${lineRuleKeys(l)
        .map((k) => citeOf(k, lang))
        .join("; ")} |`,
    );
  const { used } = splitRules(r);
  out.push(``, zh ? `## 用到的官方規定` : `## Official rules used`, ``);
  for (const rule of used) {
    out.push(`### ${ruleTitle(rule.key, lang)}（${citeOf(rule.key, lang)}）：${ruleValueWords(rule, cur, lang)}${rule.effectiveFrom ? (zh ? `，${rule.effectiveFrom} 起` : `, from ${rule.effectiveFrom}`) : ""}${rule.status !== "in_force" ? (zh ? `（${statusWords(rule, lang)}）` : ` (${statusWords(rule, lang)})`) : ""}`);
    for (const ci of rule.citations) out.push(``, `> ${ci.quote}`, ``, `${zh ? "出處" : "Source"}: [${ci.title}](${ci.url})`);
    out.push(``);
  }
  for (const h of r.holidays) {
    out.push(`### ${zh ? "國定假日" : "Holiday"}: ${zh ? h.name : holidayNameEn(h.name)} (${holidayLabel(h, r.shifts)})`);
    for (const ci of h.citations) out.push(``, `> ${ci.quote}`, ``, `${zh ? "出處" : "Source"}: [${ci.title}](${ci.url})`);
    if (h.dateSource) out.push(``, `${zh ? "日期" : "Date"}: ${h.dateSource.note} [${h.dateSource.title}](${h.dateSource.url})`);
    out.push(``);
  }
  const as = zh ? c.assumptionsZh : c.assumptions;
  if (as.length) out.push(zh ? `## 假設` : `## Assumptions`, ``, ...as.map((a) => `- ${a}`), ``);
  for (const a of r.alternatives ?? [])
    out.push(zh ? `## 另一種算法` : `## The other reading`, ``, `- ${a.primary[lang]}: ${fmtMoney(c.expectedTotal, cur)}`, `- ${a.alt[lang]}: ${fmtMoney(a.expectedTotal, cur)}`, ``);
  out.push(zh ? `## 給雇主的訊息` : `## Message to employer`, ``, r.explanation.messageToEmployer, ``);
  if (r.explanation.messageTranslation && (r.explanation.messageLang ?? "zh") !== lang) out.push(zh ? `中文翻譯：` : `Translation:`, ``, r.explanation.messageTranslation, ``);
  out.push(`---`, zh ? DISCLAIMER_ZH : r.disclaimer);
  return out.join("\n");
}

/** Rule value in words: 每小時 196 元, 加倍, 40 小時. */
export function ruleValueWords(r: RuleRecord, currency: "TWD" | "USD", lang: Lang): string {
  const spec = specByKey(r.key);
  if (spec?.kind === "hours_limit") return lang === "zh" ? `${r.value} 小時` : `${r.value} hours`;
  if (r.key === "ny.tip_credit") return lang === "zh" ? `每小時最多 ${fmtMoney(r.value, currency, true)}` : `up to ${fmtMoney(r.value, currency, true)} per hour`;
  if (spec?.kind === "amount") return lang === "zh" ? `每小時 ${fmtMoney(r.value, currency, true)}` : `${fmtMoney(r.value, currency, true)} per hour`;
  return multiplierWords(r.value, lang);
}
