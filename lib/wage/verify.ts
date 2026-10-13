import { normalise, type DocStore } from "../agent/citations";
import type { Citation } from "../types";
import { NY_REGION_WORDS, specByKey, type RuleSpec } from "./catalog";
import { DGPA_CALENDARS, LUNAR_QUOTE_RULES, lunarHolidayOn } from "./holidays-tw";
import { approxEqual, statedDates, statedHourLimits, statedMonthDays, statedRates } from "./numbers";
import type { HolidayRecord, Jurisdiction, NyRegion, RuleKey, RuleRecord, TipVariant } from "./types";

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
  variant?: string;
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
  "tw.weekly_hours": { must: [/每週工作總時數超過/], not: [/四十八小時/] },
  "ny.ot_weekly": { must: [/\b40\b/], not: [/tip credit/i] },
  "ny.ot_tipped": { must: [/before subtracting any tip credit/i, /minus the tip credit/i] },
  "ny.spread_hosp": { must: [/spread of hours exceeds/i, /one additional hour of pay at the basic minimum/i] },
  "ny.spread_misc": { must: [/spread of hours exceeds/i, /one hour's pay at the basic minimum/i] },
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
  if (key === "ny.tip_credit") {
    // "$11.35 Cash Wage, $5.65 Credit, $17.00 Total on and after January 1, 2026"
    return [...q.matchAll(/Cash Wage,\s*\$\s?(\d+\.\d{2})\s*Credit/gi)].map((m) => Number(m[1]));
  }
  return [];
}

// Headings in the Hospitality Wage Order (12 NYCRR 146-1.3), in normalised form
// (no spaces, lower case). The rate rows repeat for every region, so the region
// and job type of a quoted row are read from the nearest heading above it.
const TIP_REGION_HEADS: Record<NyRegion, string[]> = {
  nyc: ["newyorkcityby", "newyorkcityfor"],
  li_westchester: ["remainderofdownstate"],
  rest: ["remainderofstate(outside"],
};
const TIP_VARIANT_HEADS: Record<TipVariant, string[]> = {
  service: ["tipcreditsforserviceemployees", "forserviceemployeesatresorthotels"],
  food_service: ["tipcreditsforfoodserviceworkers"],
};

function lastHeading<T extends string>(ctx: string, heads: Record<T, string[]>): T | undefined {
  let best: T | undefined;
  let at = -1;
  for (const k of Object.keys(heads) as T[]) {
    for (const h of heads[k]) {
      const i = ctx.lastIndexOf(h);
      if (i > at) {
        at = i;
        best = k;
      }
    }
  }
  return best;
}

/** Region and job type headings that apply at the end of a normalised context. */
export function tipHeadings(ctx: string): { region?: NyRegion; variant?: TipVariant } {
  return { region: lastHeading(ctx, TIP_REGION_HEADS), variant: lastHeading(ctx, TIP_VARIANT_HEADS) };
}

/** True if some place the quote appears sits under the given region and job type headings. */
export function tipRowMatches(docs: DocStore, url: string, quote: string, region: NyRegion, variant: TipVariant): boolean {
  return docs
    .contextsBefore(url, quote)
    .some((ctx) => lastHeading(ctx, TIP_REGION_HEADS) === region && lastHeading(ctx, TIP_VARIANT_HEADS) === variant);
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
  const needsRegion = spec.key === "ny.min_wage_hourly" || spec.key === "ny.tip_credit";
  if (needsRegion && (!region || !(region in NY_REGION_WORDS))) return { ok: false, reason: "region must be one of nyc, li_westchester, rest" };
  const variant = p.variant as TipVariant | undefined;
  if (spec.key === "ny.tip_credit" && variant !== "food_service" && variant !== "service")
    return { ok: false, reason: "variant must be food_service or service" };

  const cits: Citation[] = [];
  const urls: string[] = [];
  for (const c of (p.citations || []).slice(0, 3)) {
    const v = docs.verify(String(c.source_url || ""), String(c.quote || ""));
    if (!v.ok) return { ok: false, reason: v.reason };
    cits.push(v.citation);
    urls.push(String(c.source_url || ""));
  }
  if (cits.length === 0) return { ok: false, reason: "at least one citation is required" };
  const quotes = cits.map((c) => c.quote);

  if (spec.kind === "amount") {
    const idx = quotes.findIndex((q) => targetAmounts(spec.key, q, region).some((a) => approxEqual(a, p.value)));
    if (idx < 0) return { ok: false, reason: `the quote does not state ${p.value} as the ${spec.label}` };
    if (spec.key === "ny.tip_credit" && !tipRowMatches(docs, urls[idx], quotes[idx], region!, variant!))
      return { ok: false, reason: `the quoted row is not listed under ${region} for ${variant === "food_service" ? "food service workers" : "service employees"}` };
  } else if (spec.kind === "hours_limit") {
    const q = quotes.find((x) => checkPhrases(spec.key, x));
    if (!q) return { ok: false, reason: `the quote is not the clause for ${spec.label}` };
    const hours = statedHourLimits(q);
    if (hours.length !== 1) return { ok: false, reason: "quote exactly one clause that states one number of hours" };
    if (!approxEqual(hours[0], p.value)) return { ok: false, reason: `the quote gives ${hours[0]} hours, not ${p.value}` };
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
      region: needsRegion ? region : undefined,
      variant: spec.key === "ny.tip_credit" ? variant : undefined,
      citations: cits,
      recordedBy,
    },
  };
}

export interface ProposedHoliday {
  month_day?: string;
  /** YYYY-MM-DD, for lunar-calendar holidays. */
  date?: string;
  name: string;
  citations: { source_url: string; quote: string }[];
}

function verifyCitations(p: ProposedHoliday, docs: DocStore): Result<Citation[]> {
  const cits: Citation[] = [];
  for (const c of (p.citations || []).slice(0, 3)) {
    const v = docs.verify(String(c.source_url || ""), String(c.quote || ""));
    if (!v.ok) return { ok: false, reason: v.reason };
    cits.push(v.citation);
  }
  return { ok: true, value: cits };
}

/**
 * Lunar-calendar holiday. The solar date must be in the official DGPA calendar
 * table (holidays-tw.ts); the quotes must state the lunar rule and that the day
 * is off, from text retrieved in this run.
 */
export function verifyLunarHoliday(p: ProposedHoliday, docs: DocStore, recordedBy: HolidayRecord["recordedBy"]): Result<HolidayRecord> {
  const date = String(p.date || "");
  const h = lunarHolidayOn(date);
  if (!h) return { ok: false, reason: `${date} is not a lunar-calendar holiday in the official 2026-2027 calendar table` };
  const cits = verifyCitations(p, docs);
  if (!cits.ok) return cits;
  const rules = LUNAR_QUOTE_RULES[h.group];
  const flat = cits.value.map((c) => normalise(c.quote));
  if (!flat.some((q) => rules.rule.test(q))) return { ok: false, reason: `no quote states the lunar date rule for ${h.name}` };
  if (!flat.some((q) => rules.off.test(q))) return { ok: false, reason: `no quote says ${h.name} is a day off` };
  const cal = DGPA_CALENDARS[date.slice(0, 4)];
  return {
    ok: true,
    value: {
      monthDay: date.slice(5),
      date,
      name: h.name,
      citations: cits.value,
      dateSource: { url: cal.url, title: cal.title, note: `${h.lunar}. Solar date from the official calendar, kept as a table in code.` },
      recordedBy,
    },
  };
}

export function verifyHoliday(p: ProposedHoliday, docs: DocStore, recordedBy: HolidayRecord["recordedBy"]): Result<HolidayRecord> {
  if (p.date) return verifyLunarHoliday(p, docs, recordedBy);
  const name = String(p.name || "").trim();
  if (name.length < 2) return { ok: false, reason: "name is required" };
  if (!/^\d{2}-\d{2}$/.test(p.month_day || "")) return { ok: false, reason: "month_day must be MM-DD (or give date YYYY-MM-DD for a lunar holiday)" };
  const v = verifyCitations(p, docs);
  if (!v.ok) return v;
  const cits = v.value;
  const dateOk = cits.some((c) => {
    const i = c.quote.indexOf(name);
    return i >= 0 && statedMonthDays(c.quote.slice(i, i + name.length + 12)).includes(p.month_day!);
  });
  if (!dateOk) return { ok: false, reason: `no quote gives ${name} the date ${p.month_day}` };
  // The day-off quote must come from a "放假" clause, not from the names-and-dates list.
  const offOk = cits.some((c) =>
    c.quote
      .split(/第\s*\d+\s*條/)
      .some((seg) => seg.includes(name) && /放假[一五]日/.test(seg) && !/名稱及日期/.test(seg)),
  );
  if (!offOk) return { ok: false, reason: `no quote says ${name} is a day off` };
  return { ok: true, value: { monthDay: p.month_day!, name, citations: cits, recordedBy } };
}
