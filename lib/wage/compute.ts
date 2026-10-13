import { NY_REGION_LABEL } from "./catalog";
import type { Computation, DayType, HolidayRecord, Jurisdiction, NyRegion, PayLine, Payslip, Problem, RuleKey, RuleRecord, Shift } from "./types";
import type { RawShift } from "./parse";
import { shiftHours } from "./parse";

// All money math lives here. Inputs are verified rule values; no model output
// is used as a number. Pure functions, unit-tested against MOL's own examples.

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekday(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

export function resolveShifts(
  raw: RawShift[],
  opts: { jurisdiction: Jurisdiction; holidays: HolidayRecord[]; restDayWeekday?: number; dayOffWeekday?: number },
): Shift[] {
  const sorted = [...raw].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  return sorted.map((r, i) => {
    let dayType: DayType = "workday";
    let source: Shift["dayTypeSource"] = "default";
    let holidayName: string | undefined;
    if (opts.jurisdiction === "TW") {
      const h = opts.holidays.find((x) => x.monthDay === r.date.slice(5));
      if (r.marked) {
        dayType = r.marked;
        source = "you";
      } else if (h) {
        dayType = "holiday";
        source = "official_holiday";
        holidayName = h.name;
      } else if (opts.restDayWeekday !== undefined && weekday(r.date) === opts.restDayWeekday) {
        dayType = "rest_day";
        source = "you";
      } else if (opts.dayOffWeekday !== undefined && weekday(r.date) === opts.dayOffWeekday) {
        dayType = "regular_day_off";
        source = "you";
      }
      if (dayType === "holiday" && !holidayName && h) holidayName = h.name;
    }
    return {
      id: `sh${i + 1}`,
      date: r.date,
      start: r.start,
      end: r.end,
      breakMinutes: r.breakMinutes,
      hours: shiftHours(r.start, r.end, r.breakMinutes),
      dayType,
      dayTypeSource: source,
      holidayName,
      raw: r.raw,
    };
  });
}

export function minWageFor(rules: RuleRecord[], date: string, region?: NyRegion): RuleRecord | undefined {
  return rules
    .filter(
      (r) =>
        (r.key === "tw.min_wage_hourly" || r.key === "ny.min_wage_hourly") &&
        (!region || r.region === region) &&
        r.effectiveFrom &&
        r.effectiveFrom <= date &&
        (!r.effectiveTo || r.effectiveTo >= date),
    )
    .sort((a, b) => (b.effectiveFrom! > a.effectiveFrom! ? 1 : b.effectiveFrom! < a.effectiveFrom! ? -1 : a.status === "in_force" ? -1 : 1))[0];
}

function rule(rules: RuleRecord[], key: RuleKey): RuleRecord | undefined {
  return rules.find((r) => r.key === key);
}

const round = (n: number, currency: "TWD" | "USD") => (currency === "TWD" ? Math.round(n) : Math.round(n * 100) / 100);

interface Segment {
  hours: number;
  key: RuleKey | null; // null = straight time
  label: string;
}

function twSegments(s: Shift): Segment[] {
  const h = s.hours;
  const take = (from: number, len: number) => Math.max(0, Math.min(h, from + len) - from);
  switch (s.dayType) {
    case "rest_day":
      return [
        { hours: take(0, 2), key: "tw.rest_first2", label: "Rest day, hours 1-2" },
        { hours: Math.max(0, h - 2), key: "tw.rest_after2", label: "Rest day, after hour 2" },
      ];
    case "holiday":
    case "regular_day_off": {
      const k: RuleKey = s.dayType === "holiday" ? "tw.holiday" : "tw.day_off";
      const name = s.dayType === "holiday" ? "Holiday" : "Regular day off";
      return [
        { hours: take(0, 8), key: k, label: `${name}, hours 1-8` },
        { hours: take(8, 2), key: "tw.ot_first2", label: `${name}, overtime hours 9-10` },
        { hours: Math.max(0, h - 10), key: "tw.ot_next2", label: `${name}, overtime after hour 10` },
      ];
    }
    default:
      return [
        { hours: take(0, 8), key: null, label: "Regular hours" },
        { hours: take(8, 2), key: "tw.ot_first2", label: "Overtime hours 9-10" },
        { hours: Math.max(0, h - 10), key: "tw.ot_next2", label: "Overtime after hour 10" },
      ];
  }
}

export function compute(input: {
  jurisdiction: Jurisdiction;
  nyRegion?: NyRegion;
  shifts: Shift[];
  payslip: Payslip;
  rules: RuleRecord[];
  workweekStart?: number;
}): Computation {
  const { jurisdiction, shifts, payslip, rules } = input;
  const currency = payslip.currency;
  const lines: PayLine[] = [];
  const problems: Problem[] = [];
  const assumptions: string[] = [];
  const missing = new Set<RuleKey>();
  let base = 0;
  let topUp = 0;
  let premiums = 0;
  let belowMin = 0;
  const stated = payslip.hourlyRate;
  if (stated === undefined) assumptions.push("No hourly rate found on the payslip. The minimum wage is used as the rate.");

  const rateFor = (s: Shift): { rate: number; mw?: RuleRecord } => {
    const mw = minWageFor(rules, s.date, jurisdiction === "US-NY" ? input.nyRegion : undefined);
    const r = Math.max(stated ?? 0, mw?.value ?? 0);
    if (stated !== undefined && mw && stated < mw.value) belowMin += s.hours * (mw.value - stated);
    if (!mw) missing.add(jurisdiction === "TW" ? "tw.min_wage_hourly" : "ny.min_wage_hourly");
    return { rate: r || (stated ?? 0), mw };
  };

  const push = (s: Shift, seg: Segment, rate: number, mw: RuleRecord | undefined) => {
    if (seg.hours <= 0) return;
    let mult = 1;
    const keys: RuleKey[] = mw ? [mw.key] : [];
    let note: string | undefined;
    if (seg.key) {
      const r = rule(rules, seg.key);
      if (r) {
        mult = r.value;
        keys.push(seg.key);
      } else {
        missing.add(seg.key);
        note = "Rule not retrieved: counted at straight time only.";
      }
    }
    if (mw?.status === "pending_approval") note = [note, "Minimum wage for this date is decided but still pending approval."].filter(Boolean).join(" ");
    const amount = seg.hours * rate * mult;
    base += seg.hours * (stated ?? rate);
    topUp += seg.hours * (rate - (stated ?? rate));
    premiums += seg.hours * rate * (mult - 1);
    lines.push({ shiftId: s.id, date: s.date, label: seg.label, hours: seg.hours, baseRate: rate, multiplier: mult, amount, ruleKeys: keys, note });
  };

  if (jurisdiction === "TW") {
    for (const s of shifts) {
      const { rate, mw } = rateFor(s);
      for (const seg of twSegments(s)) push(s, seg, rate, mw);
      if (s.hours > 12) problems.push({ kind: "check", message: `${s.date}: ${s.hours} hours in one day is over the 12-hour daily limit.`, ruleKeys: [] });
      if (s.dayType === "regular_day_off")
        problems.push({ kind: "check", message: `${s.date}: work on the regular day off (例假) is only allowed for emergencies. Ask your labor bureau.`, ruleKeys: ["tw.day_off"] });
    }
    assumptions.push("Taiwan: overtime is counted per day (hours beyond 8). The weekly 40-hour limit is not checked.");
    if (shifts.some((s) => s.dayTypeSource === "default")) assumptions.push("Days not marked otherwise are treated as normal workdays.");
  } else {
    const startDay = input.workweekStart ?? 1;
    const weekKey = (d: string) => {
      const dt = new Date(d + "T00:00:00Z");
      const diff = (dt.getUTCDay() - startDay + 7) % 7;
      dt.setUTCDate(dt.getUTCDate() - diff);
      return dt.toISOString().slice(0, 10);
    };
    const weeks = new Map<string, Shift[]>();
    for (const s of shifts) weeks.set(weekKey(s.date), [...(weeks.get(weekKey(s.date)) || []), s]);
    for (const [, ws] of [...weeks.entries()].sort()) {
      let cum = 0;
      for (const s of ws) {
        const { rate, mw } = rateFor(s);
        const regular = Math.max(0, Math.min(s.hours, 40 - cum));
        const ot = s.hours - regular;
        cum += s.hours;
        push(s, { hours: regular, key: null, label: "Regular hours" }, rate, mw);
        push(s, { hours: ot, key: "ny.ot_weekly", label: "Overtime (over 40 in the week)" }, rate, mw);
      }
    }
    assumptions.push(`New York: workweek starts on ${WEEKDAY[startDay]}. Region: ${NY_REGION_LABEL[input.nyRegion ?? "nyc"]}.`);
    assumptions.push("New York: tipped workers, spread-of-hours and call-in pay are not checked.");
  }

  const expectedTotal = round(lines.reduce((a, l) => a + l.amount, 0), currency);
  const workedHours = Math.round(shifts.reduce((a, s) => a + s.hours, 0) * 100) / 100;
  const paidTotal = payslip.grossPaid;
  const shortfall = paidTotal !== undefined ? round(expectedTotal - paidTotal, currency) : undefined;

  for (const k of missing)
    problems.push({ kind: "missing_rule", message: `No official source was retrieved for ${k}. Lines that need it are counted at straight time.`, ruleKeys: [k] });
  if (belowMin > 0)
    problems.push({
      kind: "below_min_wage",
      message: `The stated hourly rate is below the minimum wage for some shifts.`,
      amount: round(belowMin, currency),
      ruleKeys: [jurisdiction === "TW" ? "tw.min_wage_hourly" : "ny.min_wage_hourly"],
    });
  if (payslip.hoursPaid !== undefined && payslip.hoursPaid + 0.01 < workedHours)
    problems.push({
      kind: "unpaid_hours",
      message: `The payslip pays ${payslip.hoursPaid} hours, but the schedule shows ${workedHours} hours.`,
      amount: round((workedHours - payslip.hoursPaid) * (stated ?? 0), currency),
      ruleKeys: [],
    });
  if (shortfall !== undefined && shortfall > 0 && premiums > 0) {
    const premiumKeys = [...new Set(lines.filter((l) => l.multiplier > 1).flatMap((l) => l.ruleKeys.filter((k) => !k.includes("min_wage"))))];
    problems.push({
      kind: "unpaid_premium",
      message: "Premium pay is due for overtime, rest day or holiday hours.",
      amount: round(premiums, currency),
      ruleKeys: premiumKeys,
    });
  }
  if (paidTotal === undefined) assumptions.push("No total paid amount found on the payslip, so no shortfall is calculated.");

  return {
    currency,
    lines,
    expectedTotal,
    paidTotal,
    shortfall,
    workedHours,
    components: { base: round(base, currency), minWageTopUp: round(topUp, currency), premiums: round(premiums, currency) },
    problems,
    assumptions,
  };
}
