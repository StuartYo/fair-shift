import type { DocStore } from "../agent/citations";
import type { Citation } from "../types";
import { NY_REGION_WORDS, specByKey, type RuleSpec } from "./catalog";
import { approxEqual, statedDates, statedMonthDays, statedRates } from "./numbers";
import type { HolidayRecord, Jurisdiction, NyRegion, RuleKey, RuleRecord } from "./types";

// Code-side checks. A rule value is accepted only when:
//  1. every quote is verbatim in text retrieved during this run, and
//  2. the value (and effective date, where needed) can be read back out of
//     those quotes by code, for the specific rule asked about.
// The model proposes; this file decides.

export interface ProposedRule {
  key: string;
  value: number;
  effective_from?: string;
  effective_to?: string;
  region?: string;
  citations: { source_url: string; quote: string }[];
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Words a quote must (or must not) contain, so a clause for one rule cannot be reused for another. */
const PHRASES: Partial<Record<RuleKey, { must: RegExp[]; not?: RegExp[] }>> = {
  "tw.ot_first2": { must: [/延長工作時間在二小時以內/], not: [/再延長/, /休息日/] },
  "tw.ot_next2": { must: [/再延長工作時間在二小時以內/] },
  "tw.rest_first2": { must: [/休息日/, /二小時以內/] },
  "tw.rest_after2": { must: [/二小時後再繼續工作/] },
  "tw.holiday": { must: [/休假日/] },
  "tw.day_off": { must: [/停止假期/] },
  "ny.ot_weekly": { must: [/\b40\b/] },
};

const PENDING = /陳報行政院核定|待行政院核定|pending approval|subject to approval|proposed/i;

/** Pull the target hourly amount out of a quote for a given rule. Returns all candidates. */
export function targetAmounts(key: RuleKey, quote: string, region?: NyRegion): number[] {
  const q = quote.normalize("NFKC");
  if (key === "tw.min_wage_hourly") {
    return [...q.matchAll(/每小時最低工資[^。；]*?(?:為|至)\s*(\d[\d,]*)\s*元/g)].map((m) => Number(m[1].replace(/,/g, "")));
  }
  if (key === "ny.min_wage_hourly" && region) {
    const out: number[] = [];
    for (const m of q.matchAll(/\$\s?(\d+(?:\.\d{2})?)\s*per hour/gi)) {
      const after = q.slice(m.index! + m[0].length, m.index! + m[0].length + 70);
      const span = after.split("$")[0];
      if (NY_REGION_WORDS[region].test(span)) out.push(Number(m[1]));
    }
    return out;
  }
  return [];
}

function checkPhrases(key: RuleKey, quote: string): boolean {
  const p = PHRASES[key];
  if (!p) return true;
  return p.must.every((r) => r.test(quote)) && !(p.not || []).some((r) => r.test(quote));
}

export function verifyRule(
  p: ProposedRule,
  docs: DocStore,
  jurisdiction: Jurisdiction,
  recordedBy: RuleRecord["recordedBy"],
): Result<RuleRecord> {
  const spec: RuleSpec | undefined = specByKey(p.key);
  if (!spec || spec.jurisdiction !== jurisdiction) return { ok: false, reason: `unknown rule key ${p.key} for ${jurisdiction}` };
  if (!Number.isFinite(p.value) || p.value <= 0) return { ok: false, reason: "value must be a positive number" };
  const region = p.region as NyRegion | undefined;
  if (spec.key === "ny.min_wage_hourly" && (!region || !(region in NY_REGION_WORDS)))
    return { ok: false, reason: "region must be one of nyc, li_westchester, rest" };

  const cits: Citation[] = [];
  for (const c of (p.citations || []).slice(0, 3)) {
    const v = docs.verify(String(c.source_url || ""), String(c.quote || ""));
    if (!v.ok) return { ok: false, reason: v.reason };
    cits.push(v.citation);
  }
  if (cits.length === 0) return { ok: false, reason: "at least one citation is required" };
  const quotes = cits.map((c) => c.quote);

  if (spec.kind === "amount") {
    const found = quotes.some((q) => targetAmounts(spec.key, q, region).some((a) => approxEqual(a, p.value)));
    if (!found) return { ok: false, reason: `the quote does not state ${p.value} as the ${spec.label}` };
  } else {
    const q = quotes.find((x) => checkPhrases(spec.key, x));
    if (!q) return { ok: false, reason: `the quote is not the clause for ${spec.label}` };
    const rates = statedRates(q);
    if (rates.length !== 1) return { ok: false, reason: "quote exactly one clause that states one rate" };
    const mult = spec.kind === "extra_fraction" ? 1 + rates[0] : rates[0];
    if (!approxEqual(mult, p.value)) return { ok: false, reason: `the quote gives a multiplier of ${mult.toFixed(4)}, not ${p.value}` };
  }

  let effectiveFrom: string | undefined;
  let effectiveTo: string | undefined;
  if (spec.requiresDate) {
    const dates = new Set(quotes.flatMap(statedDates));
    if (!p.effective_from || !dates.has(p.effective_from))
      return { ok: false, reason: "effective_from must be a date written in the quote (YYYY-MM-DD)" };
    effectiveFrom = p.effective_from;
    if (p.effective_to && dates.has(p.effective_to)) effectiveTo = p.effective_to;
  }
  const status: RuleRecord["status"] = quotes.some((q) => PENDING.test(q)) ? "pending_approval" : "in_force";
  return {
    ok: true,
    value: {
      key: spec.key,
      value: p.value,
      effectiveFrom,
      effectiveTo,
      status,
      region: spec.key === "ny.min_wage_hourly" ? region : undefined,
      citations: cits,
      recordedBy,
    },
  };
}

export interface ProposedHoliday {
  month_day: string;
  name: string;
  citations: { source_url: string; quote: string }[];
}

export function verifyHoliday(p: ProposedHoliday, docs: DocStore, recordedBy: HolidayRecord["recordedBy"]): Result<HolidayRecord> {
  const name = String(p.name || "").trim();
  if (name.length < 2) return { ok: false, reason: "name is required" };
  if (!/^\d{2}-\d{2}$/.test(p.month_day || "")) return { ok: false, reason: "month_day must be MM-DD" };
  const cits: Citation[] = [];
  for (const c of (p.citations || []).slice(0, 3)) {
    const v = docs.verify(String(c.source_url || ""), String(c.quote || ""));
    if (!v.ok) return { ok: false, reason: v.reason };
    cits.push(v.citation);
  }
  const dateOk = cits.some((c) => {
    const i = c.quote.indexOf(name);
    return i >= 0 && statedMonthDays(c.quote.slice(i, i + name.length + 12)).includes(p.month_day);
  });
  if (!dateOk) return { ok: false, reason: `no quote gives ${name} the date ${p.month_day}` };
  // The day-off quote must come from a "放假" clause, not from the names-and-dates list.
  const offOk = cits.some((c) =>
    c.quote
      .split(/第\s*\d+\s*條/)
      .some((seg) => seg.includes(name) && /放假[一五]日/.test(seg) && !/名稱及日期/.test(seg)),
  );
  if (!offOk) return { ok: false, reason: `no quote says ${name} is a day off` };
  return { ok: true, value: { monthDay: p.month_day, name, citations: cits, recordedBy } };
}
