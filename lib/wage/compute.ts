import { isHospitality, isTipped, NY_JOB_LABEL, NY_REGION_LABEL } from "./catalog";
import { LUNAR_YEARS } from "./holidays-tw";
import type {
  Computation,
  DayType,
  HolidayRecord,
  Jurisdiction,
  NyJob,
  NyRegion,
  PayLine,
  Payslip,
  Problem,
  RuleKey,
  RuleRecord,
  Shift,
} from "./types";
import type { RawShift } from "./parse";
import { shiftHours } from "./parse";

// All money math lives here. Inputs are verified rule values; no model output
// is used as a number. Pure functions, unit-tested against MOL's own examples
// and hand-checked cases.

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekday(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

/** Monday (or the given start day) of the week a date falls in, as YYYY-MM-DD. */
export function weekStartOf(date: string, startDay = 1): string {
  const dt = new Date(date + "T00:00:00Z");
  const diff = (dt.getUTCDay() - startDay + 7) % 7;
  dt.setUTCDate(dt.getUTCDate() - diff);
  return dt.toISOString().slice(0, 10);
}

function holidayOn(holidays: HolidayRecord[], date: string): HolidayRecord | undefined {
  return holidays.find((x) => (x.date ? x.date === date : x.monthDay === date.slice(5)));
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
      const h = holidayOn(opts.holidays, r.date);
      holidayName = h?.name;
      if (r.marked) {
        dayType = r.marked;
        source = "you";
      } else if (opts.restDayWeekday !== undefined && weekday(r.date) === opts.restDayWeekday) {
        // A holiday on your rest day stays a rest day; the employer owes a substitute day off (MOL, 2026-10-07).
        dayType = "rest_day";
        source = "you";
      } else if (opts.dayOffWeekday !== undefined && weekday(r.date) === opts.dayOffWeekday) {
        dayType = "regular_day_off";
        source = "you";
      } else if (h) {
        dayType = "holiday";
        source = "official_holiday";
      }
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

function inRange(r: RuleRecord, date: string): boolean {
  return !!r.effectiveFrom && r.effectiveFrom <= date && (!r.effectiveTo || r.effectiveTo >= date);
}

function latestFirst(a: RuleRecord, b: RuleRecord): number {
  if (b.effectiveFrom! !== a.effectiveFrom!) return b.effectiveFrom! > a.effectiveFrom! ? 1 : -1;
  return a.status === "in_force" ? -1 : 1;
}

export function minWageFor(rules: RuleRecord[], date: string, region?: NyRegion): RuleRecord | undefined {
  return rules
    .filter((r) => (r.key === "tw.min_wage_hourly" || r.key === "ny.min_wage_hourly") && (!region || r.region === region) && inRange(r, date))
    .sort(latestFirst)[0];
}

export function tipCreditFor(rules: RuleRecord[], date: string, region: NyRegion, job: NyJob): RuleRecord | undefined {
  return rules.filter((r) => r.key === "ny.tip_credit" && r.region === region && r.variant === job && inRange(r, date)).sort(latestFirst)[0];
}

function rule(rules: RuleRecord[], key: RuleKey): RuleRecord | undefined {
  return rules.find((r) => r.key === key);
}

const round = (n: number, currency: "TWD" | "USD") => (currency === "TWD" ? Math.round(n) : Math.round(n * 100) / 100);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

interface Segment {
  hours: number;
  key: RuleKey | null; // null = straight time
  label: string;
  extraKeys?: RuleKey[];
}

function twSpecialSegments(s: Shift): Segment[] {
  const h = s.hours;
  const take = (from: number, len: number) => Math.max(0, Math.min(h, from + len) - from);
  if (s.dayType === "rest_day")
    return [
      { hours: take(0, 2), key: "tw.rest_first2", label: "Rest day, hours 1-2" },
      { hours: Math.max(0, h - 2), key: "tw.rest_after2", label: "Rest day, after hour 2" },
    ];
  const k: RuleKey = s.dayType === "holiday" ? "tw.holiday" : "tw.day_off";
  const name = s.dayType === "holiday" ? "Holiday" : "Regular day off";
  return [
    { hours: take(0, 8), key: k, label: `${name}, hours 1-8` },
    { hours: take(8, 2), key: "tw.ot_first2", label: `${name}, overtime hours 9-10` },
    { hours: Math.max(0, h - 10), key: "tw.ot_next2", label: `${name}, overtime after hour 10` },
  ];
}

/**
 * Workday segments. Overtime on a day = hours beyond 8 that day, plus regular
 * hours that push the week past the weekly limit (LSA Enforcement Rules Art.
 * 20-1). The day's overtime hours are tiered per Art. 24: first 2 at 4/3, the
 * rest at 5/3.
 */
function twWorkdaySegments(s: Shift, weekRegularBefore: number, weeklyLimit?: number): Segment[] {
  const dailyRegular = Math.min(s.hours, 8);
  const dailyOt = Math.max(0, s.hours - 8);
  const straight = weeklyLimit === undefined ? dailyRegular : Math.min(dailyRegular, Math.max(0, weeklyLimit - weekRegularBefore));
  const weeklyOt = dailyRegular - straight;
  const ot = weeklyOt + dailyOt;
  const first = Math.min(ot, 2);
  const rest = Math.max(0, ot - 2);
  if (weeklyOt === 0)
    return [
      { hours: straight, key: null, label: "Regular hours" },
      { hours: first, key: "tw.ot_first2", label: "Overtime hours 9-10" },
      { hours: rest, key: "tw.ot_next2", label: "Overtime after hour 10" },
    ];
  const why = dailyOt > 0 ? `over ${weeklyLimit} a week and 8 a day` : `over ${weeklyLimit} hours this week`;
  return [
    { hours: straight, key: null, label: "Regular hours" },
    { hours: first, key: "tw.ot_first2", label: `Overtime hours 1-2 of the day (${why})`, extraKeys: ["tw.weekly_hours"] },
    { hours: rest, key: "tw.ot_next2", label: `Overtime after 2 hours (${why})`, extraKeys: ["tw.weekly_hours"] },
  ];
}

export function compute(input: {
  jurisdiction: Jurisdiction;
  nyRegion?: NyRegion;
  nyJob?: NyJob;
  shifts: Shift[];
  payslip: Payslip;
  rules: RuleRecord[];
  workweekStart?: number;
}): Computation {
  const { jurisdiction, shifts, payslip, rules } = input;
  const currency = payslip.currency;
  const region = input.nyRegion ?? "nyc";
  const job: NyJob = input.nyJob ?? "general";
  const tipped = jurisdiction === "US-NY" && isTipped(job);
  const lines: PayLine[] = [];
  const problems: Problem[] = [];
  const assumptions: string[] = [];
  const missing = new Set<RuleKey>();
  let base = 0;
  let topUp = 0;
  let premiums = 0;
  let belowMin = 0;
  const stated = payslip.hourlyRate;
  if (stated === undefined)
    assumptions.push(tipped ? "No hourly rate found on the payslip. The minimum cash wage for tipped workers is used." : "No hourly rate found on the payslip. The minimum wage is used as the rate.");

  const minWage = (s: Shift) => {
    const mw = minWageFor(rules, s.date, jurisdiction === "US-NY" ? region : undefined);
    if (!mw) missing.add(jurisdiction === "TW" ? "tw.min_wage_hourly" : "ny.min_wage_hourly");
    return mw;
  };

  const rateFor = (s: Shift): { rate: number; mw?: RuleRecord } => {
    const mw = minWage(s);
    const r = Math.max(stated ?? 0, mw?.value ?? 0);
    if (stated !== undefined && mw && stated < mw.value) belowMin += s.hours * (mw.value - stated);
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
    for (const k of seg.extraKeys || []) if (rule(rules, k)) keys.push(k);
    if (mw?.status === "pending_approval") note = [note, "Minimum wage for this date is decided but still pending approval."].filter(Boolean).join(" ");
    const amount = seg.hours * rate * mult;
    base += seg.hours * (stated ?? rate);
    topUp += seg.hours * (rate - (stated ?? rate));
    premiums += seg.hours * rate * (mult - 1);
    lines.push({ shiftId: s.id, date: s.date, label: seg.label, hours: seg.hours, baseRate: rate, multiplier: mult, amount, ruleKeys: keys, note });
  };

  const startDay = input.workweekStart ?? 1;
  const weeks = new Map<string, Shift[]>();
  for (const s of shifts) {
    const k = weekStartOf(s.date, startDay);
    weeks.set(k, [...(weeks.get(k) || []), s]);
  }
  const weekList = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));

  if (jurisdiction === "TW") {
    const weekly = rule(rules, "tw.weekly_hours");
    if (!weekly && shifts.some((s) => s.dayType === "workday")) missing.add("tw.weekly_hours");
    for (const [, ws] of weekList) {
      let regularSoFar = 0;
      for (const s of ws) {
        const { rate, mw } = rateFor(s);
        if (s.dayType === "workday") {
          for (const seg of twWorkdaySegments(s, regularSoFar, weekly?.value)) push(s, seg, rate, mw);
          regularSoFar += Math.min(s.hours, 8);
        } else {
          for (const seg of twSpecialSegments(s)) push(s, seg, rate, mw);
        }
        if (s.hours > 12) problems.push({ kind: "check", message: `${s.date}: ${s.hours} hours in one day is over the 12-hour daily limit.`, ruleKeys: [] });
        if (s.dayType === "regular_day_off")
          problems.push({ kind: "check", message: `${s.date}: work on the regular day off (例假) is only allowed for emergencies. Ask your labor bureau.`, ruleKeys: ["tw.day_off"] });
        if (s.holidayName && s.dayType !== "holiday")
          assumptions.push(`${s.date} is ${s.holidayName}, but it falls on your ${s.dayType.replace(/_/g, " ")}, so that day's rules apply. Your employer owes you a substitute day off (補假) for the holiday.`);
      }
    }
    assumptions.push(
      weekly
        ? `Taiwan: overtime counts hours beyond 8 a day or beyond ${weekly.value} a week. The workweek starts on ${WEEKDAY[startDay]}. Rest day and holiday hours have their own rates and do not count toward the ${weekly.value}. Flexible schedules (變形工時) are not checked.`
        : "Taiwan: overtime is counted per day only (hours beyond 8), because the weekly rule was not retrieved.",
    );
    if (shifts.some((s) => s.dayTypeSource === "default")) assumptions.push("Days not marked otherwise are treated as normal workdays. If one of them was your rest day, more is owed.");
    const outside = [...new Set(shifts.map((s) => s.date.slice(0, 4)))].filter((y) => !LUNAR_YEARS.includes(y));
    if (outside.length)
      assumptions.push(`Lunar-calendar holidays (Lunar New Year, Qingming, Dragon Boat, Mid-Autumn) are only known for ${LUNAR_YEARS.join(" and ")}. For ${outside.join(", ")}, mark them yourself with 國定假日.`);
    assumptions.push("If a holiday fell on your rest day or day off, the substitute day off (補假) is agreed with your employer. Fair Shift cannot know which day it is; mark it with 國定假日 if you worked it.");
  } else {
    const otKey: RuleKey = tipped ? "ny.ot_tipped" : "ny.ot_weekly";
    for (const [, ws] of weekList) {
      let cum = 0;
      for (const s of ws) {
        const regular = Math.max(0, Math.min(s.hours, 40 - cum));
        const ot = s.hours - regular;
        cum += s.hours;
        if (!tipped) {
          const { rate, mw } = rateFor(s);
          push(s, { hours: regular, key: null, label: "Regular hours" }, rate, mw);
          push(s, { hours: ot, key: "ny.ot_weekly", label: "Overtime (over 40 in the week)" }, rate, mw);
          continue;
        }
        // Tipped (12 NYCRR 146-1.3 and 146-1.4): the employer pays a cash wage
        // and counts up to the tip credit from tips. Overtime is 1.5x the
        // regular rate before the credit, minus the credit.
        const mw = minWage(s);
        const tc = tipCreditFor(rules, s.date, region, job);
        if (!tc) missing.add("ny.tip_credit");
        const mwv = mw?.value ?? 0;
        const credit = tc ? tc.value : Math.max(0, mwv - (stated ?? mwv));
        const cashMin = Math.max(0, mwv - credit);
        const cash = Math.max(stated ?? cashMin, cashMin);
        const regularRate = cash + credit;
        if (stated !== undefined && stated < cashMin) belowMin += s.hours * (cashMin - stated);
        const keys: RuleKey[] = [...(mw ? [mw.key] : []), ...(tc ? (["ny.tip_credit"] as RuleKey[]) : [])];
        const note = tc ? undefined : "Tip credit rule not retrieved: assumed the credit taken was allowed.";
        if (regular > 0) {
          lines.push({ shiftId: s.id, date: s.date, label: "Regular hours (cash wage after tip credit)", hours: regular, baseRate: regularRate, multiplier: 1, deduction: credit, amount: regular * cash, ruleKeys: keys, note });
          base += regular * (stated ?? cash);
          topUp += regular * (cash - (stated ?? cash));
        }
        if (ot > 0) {
          const r = rule(rules, otKey) ?? rule(rules, "ny.ot_weekly");
          if (!r) missing.add(otKey);
          const mult = r?.value ?? 1;
          const amount = ot * (regularRate * mult - credit);
          lines.push({
            shiftId: s.id,
            date: s.date,
            label: "Overtime (over 40 in the week), tipped rate",
            hours: ot,
            baseRate: regularRate,
            multiplier: mult,
            deduction: credit,
            amount,
            ruleKeys: [...keys, ...(r ? [r.key] : [])],
            note: r ? undefined : "Rule not retrieved: counted at straight time only.",
          });
          base += ot * (stated ?? cash);
          topUp += ot * (cash - (stated ?? cash));
          premiums += amount - ot * cash;
        }
      }
    }

    // Tips plus cash wages must reach the minimum wage (146-1.3; 146-2.2 notice).
    if (tipped && payslip.tips !== undefined) {
      let needed = 0;
      let cashStraight = 0;
      for (const s of shifts) {
        const mw = minWageFor(rules, s.date, region)?.value ?? 0;
        needed += s.hours * mw;
      }
      for (const l of lines) cashStraight += l.hours * (l.baseRate - (l.deduction ?? 0));
      const gap = needed - (cashStraight + payslip.tips);
      if (gap > 0.005) {
        const hours = Math.round(shifts.reduce((a, s) => a + s.hours, 0) * 100) / 100;
        lines.push({
          shiftId: shifts.at(-1)?.id ?? "",
          date: shifts.at(-1)?.date ?? "",
          label: "Tips plus cash wage below the minimum wage: employer makes up the difference",
          hours,
          baseRate: gap / hours,
          multiplier: 1,
          amount: gap,
          ruleKeys: ["ny.min_wage_hourly", "ny.tip_credit"],
        });
        topUp += gap;
        problems.push({
          kind: "below_min_wage",
          message: "Your tips plus the cash wage came to less than the minimum wage for the hours worked. The employer must make up the difference.",
          amount: round(gap, currency),
          ruleKeys: ["ny.tip_credit", "ny.min_wage_hourly"],
        });
      }
    }

    // Spread of hours: workday longer than the limit from first start to last end.
    const hosp = isHospitality(job);
    const spreadKey: RuleKey = hosp ? "ny.spread_hosp" : "ny.spread_misc";
    const spread = rule(rules, spreadKey);
    if (!spread) missing.add(spreadKey);
    else {
      const byDay = new Map<string, Shift[]>();
      for (const s of shifts) byDay.set(s.date, [...(byDay.get(s.date) || []), s]);
      for (const [date, ds] of [...byDay.entries()].sort()) {
        const startMin = Math.min(...ds.map((s) => toMin(s.start)));
        const endMin = Math.max(...ds.map((s) => toMin(s.end) + (toMin(s.end) <= toMin(s.start) ? 1440 : 0)));
        const spreadHours = (endMin - startMin) / 60;
        if (spreadHours <= spread.value) continue;
        const mw = minWageFor(rules, date, region);
        if (!mw) continue;
        const dayHours = ds.reduce((a, s) => a + s.hours, 0);
        let due = mw.value;
        let note: string | undefined;
        if (!hosp) {
          // 142-2.4: one hour at the minimum wage "in addition to the minimum wage
          // required": owed only to the extent day pay is below minimum wage x (hours + 1).
          const dayPay = dayHours * Math.max(stated ?? 0, mw.value);
          due = Math.max(0, mw.value * (dayHours + 1) - dayPay);
          note = "Only the part not already covered by pay above the minimum wage.";
          if (due <= 0) {
            assumptions.push(`${date}: the workday spread was ${spreadHours} hours, but pay above the minimum wage already covers the extra hour.`);
            continue;
          }
        }
        lines.push({
          shiftId: ds.at(-1)!.id,
          date,
          label: `Spread of hours ${spreadHours} (over ${spread.value}): one extra hour at the minimum wage`,
          hours: 1,
          baseRate: due,
          multiplier: 1,
          amount: due,
          ruleKeys: [mw.key, spreadKey],
          note,
        });
        premiums += due;
      }
    }

    assumptions.push(`New York: workweek starts on ${WEEKDAY[startDay]}. Region: ${NY_REGION_LABEL[region]}. Job: ${NY_JOB_LABEL[job]}.`);
    if (tipped) {
      assumptions.push("Tipped job: the hourly rate on the payslip is read as your cash wage before tips, and the employer is assumed to take the full tip credit.");
      if (payslip.tips === undefined) assumptions.push("No tips amount on the payslip, so it is assumed your tips covered the tip credit.");
    }
    assumptions.push(hosp ? "Call-in pay is not checked." : "Split shifts and call-in pay are not checked.");
  }

  const expectedTotal = round(lines.reduce((a, l) => a + l.amount, 0), currency);
  const workedHours = Math.round(shifts.reduce((a, s) => a + s.hours, 0) * 100) / 100;
  const paidTotal = payslip.grossPaid;
  const shortfall = paidTotal !== undefined ? round(expectedTotal - paidTotal, currency) : undefined;

  for (const k of missing)
    problems.push({ kind: "missing_rule", message: `No official source was retrieved for ${k}. Lines that need it are counted without it.`, ruleKeys: [k] });
  if (belowMin > 0)
    problems.push({
      kind: "below_min_wage",
      message: tipped ? "The cash wage is below the minimum cash wage for tipped workers on some shifts." : "The stated hourly rate is below the minimum wage for some shifts.",
      amount: round(belowMin, currency),
      ruleKeys: [jurisdiction === "TW" ? "tw.min_wage_hourly" : tipped ? "ny.tip_credit" : "ny.min_wage_hourly"],
    });
  if (payslip.hoursPaid !== undefined && payslip.hoursPaid + 0.01 < workedHours)
    problems.push({
      kind: "unpaid_hours",
      message: `The payslip pays ${payslip.hoursPaid} hours, but the schedule shows ${workedHours} hours.`,
      amount: round((workedHours - payslip.hoursPaid) * (stated ?? 0), currency),
      ruleKeys: [],
    });
  if (shortfall !== undefined && shortfall > 0 && premiums > 0.005) {
    const premiumKeys = [
      ...new Set(
        lines
          .filter((l) => l.multiplier > 1 || l.label.startsWith("Spread"))
          .flatMap((l) => l.ruleKeys.filter((k) => !k.includes("min_wage") && k !== "ny.tip_credit")),
      ),
    ];
    problems.push({
      kind: "unpaid_premium",
      message: "Premium pay is due for overtime, rest day, holiday or spread-of-hours.",
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
