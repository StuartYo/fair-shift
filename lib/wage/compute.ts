import { isHospitality, isTipped, NY_JOB_LABEL, NY_JOB_LABEL_ZH, NY_REGION_LABEL, NY_REGION_LABEL_ZH, specByKey } from "./catalog";
import { HOLIDAYS_ADDED_2025, LUNAR_YEARS, notYetHoliday } from "./holidays-tw";
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
const WEEKDAY_ZH = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
export const DAYTYPE_ZH: Record<DayType, string> = { workday: "一般工作日", rest_day: "休息日", regular_day_off: "例假", holiday: "國定假日" };

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
  // Teachers' Day, Retrocession Day and Constitution Day became days off only in 2025.
  return holidays.find((x) => (x.date ? x.date === date : x.monthDay === date.slice(5) && !notYetHoliday(x.monthDay, date)));
}

export function nextDate(d: string): string {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Number of worked shifts: the second part of a shift split at midnight is not counted again. */
export function shiftCount(shifts: Shift[]): number {
  return shifts.filter((s) => !s.continuesFrom).length;
}

/** Longer than 6 hours from start to end, and the line says nothing about a break. */
export function breakUnstated(r: RawShift): boolean {
  if (r.breakMinutes > 0 || r.breakStated) return false;
  return shiftHours(r.start, r.end, 0) > 6;
}

export function resolveShifts(
  raw: RawShift[],
  opts: { jurisdiction: Jurisdiction; holidays: HolidayRecord[]; restDayWeekday?: number | null; dayOffWeekday?: number | null },
): Shift[] {
  const sorted = [...raw].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  // Taiwan: holidays, rest days and days off are calendar days, so a shift that
  // crosses midnight is split at 0:00 and each part gets its own day type. The
  // break is shared between the parts in proportion to their length.
  type Part = { r: RawShift; date: string; start: string; end: string; breakMinutes: number; marked: RawShift["marked"]; second: boolean };
  const parts: Part[] = [];
  for (const r of sorted) {
    const s0 = minutesOf(r.start);
    const e0 = minutesOf(r.end);
    if (opts.jurisdiction === "TW" && e0 > 0 && e0 <= s0) {
      const a = 1440 - s0;
      const breakA = Math.round((r.breakMinutes * a) / (a + e0));
      parts.push({ r, date: r.date, start: r.start, end: "24:00", breakMinutes: breakA, marked: r.marked, second: false });
      parts.push({ r, date: nextDate(r.date), start: "00:00", end: r.end, breakMinutes: r.breakMinutes - breakA, marked: null, second: true });
    } else parts.push({ r, date: r.date, start: r.start, end: r.end, breakMinutes: r.breakMinutes, marked: r.marked, second: false });
  }
  const out: Shift[] = [];
  for (const [i, p] of parts.entries()) {
    let dayType: DayType = "workday";
    let source: Shift["dayTypeSource"] = "default";
    let holidayName: string | undefined;
    if (opts.jurisdiction === "TW") {
      const h = holidayOn(opts.holidays, p.date);
      holidayName = h?.name;
      if (p.marked) {
        dayType = p.marked;
        source = "you";
      } else if (typeof opts.restDayWeekday === "number" && weekday(p.date) === opts.restDayWeekday) {
        // A holiday on your rest day stays a rest day; the employer owes a substitute day off (MOL, 2026-10-07).
        dayType = "rest_day";
        source = "you";
      } else if (typeof opts.dayOffWeekday === "number" && weekday(p.date) === opts.dayOffWeekday) {
        dayType = "regular_day_off";
        source = "you";
      } else if (h) {
        dayType = "holiday";
        source = "official_holiday";
      }
    }
    out.push({
      id: `sh${i + 1}`,
      date: p.date,
      start: p.start,
      end: p.end,
      breakMinutes: p.breakMinutes,
      hours: shiftHours(p.start, p.end, p.breakMinutes),
      dayType,
      dayTypeSource: source,
      holidayName,
      raw: p.r.raw,
      continuesFrom: p.second ? out.at(-1)!.id : undefined,
      breakUnstated: breakUnstated(p.r) || undefined,
    });
  }
  return out;
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

/** The longest run of consecutive calendar dates in a list of YYYY-MM-DD dates. */
export function longestRun(dates: string[]): string[] {
  const sorted = [...new Set(dates)].sort();
  let best: string[] = [];
  let cur: string[] = [];
  for (const d of sorted) {
    if (cur.length && nextDate(cur.at(-1)!) === d) cur.push(d);
    else cur = [d];
    if (cur.length > best.length) best = [...cur];
  }
  return best;
}

const round = (n: number, currency: "TWD" | "USD") => (currency === "TWD" ? Math.round(n) : Math.round(n * 100) / 100);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

interface Segment {
  hours: number;
  key: RuleKey | null; // null = straight time
  label: string;
  labelZh?: string;
  extraKeys?: RuleKey[];
}

/**
 * Holiday, regular day off and rest day segments. `before` is the hours already
 * worked earlier in the same workday (an earlier shift that day, or the part of
 * a night shift before midnight), so the 8-hour and 2-hour tiers count from the
 * start of the workday, not of this shift.
 */
function twSpecialSegments(s: Shift, before = 0): Segment[] {
  const h = s.hours;
  const take = (from: number, len: number) => Math.max(0, Math.min(before + h, from + len) - Math.max(before, from));
  if (s.dayType === "rest_day")
    return [
      { hours: take(0, 2), key: "tw.rest_first2", label: "Rest day, hours 1-2", labelZh: "休息日，第 1 至 2 小時" },
      { hours: take(2, Infinity), key: "tw.rest_after2", label: "Rest day, after hour 2", labelZh: "休息日，第 3 小時起" },
    ];
  const k: RuleKey = s.dayType === "holiday" ? "tw.holiday" : "tw.day_off";
  const name = s.dayType === "holiday" ? "Holiday" : "Regular day off";
  const zh = s.dayType === "holiday" ? "國定假日" : "例假";
  return [
    { hours: take(0, 8), key: k, label: `${name}, hours 1-8`, labelZh: `${zh}，第 1 至 8 小時` },
    { hours: take(8, 2), key: "tw.ot_first2", label: `${name}, overtime hours 9-10`, labelZh: `${zh}，第 9 至 10 小時（延長工時）` },
    { hours: take(10, Infinity), key: "tw.ot_next2", label: `${name}, overtime after hour 10`, labelZh: `${zh}，第 11 小時起（延長工時）` },
  ];
}

/**
 * Workday segments. Overtime on a day = hours beyond 8 that day, plus regular
 * hours that push the week past the weekly limit (LSA Enforcement Rules Art.
 * 20-1). The day's overtime hours are tiered per Art. 24: first 2 at 4/3, the
 * rest at 5/3. `before` is the hours already worked earlier in the same workday
 * and `otBefore` the overtime hours already counted that day.
 */
function twWorkdaySegments(s: Shift, weekRegularBefore: number, weeklyLimit: number | undefined, before = 0, otBefore = 0): Segment[] {
  const dailyRegular = Math.max(0, Math.min(s.hours, 8 - before));
  const dailyOt = s.hours - dailyRegular;
  const straight = weeklyLimit === undefined ? dailyRegular : Math.min(dailyRegular, Math.max(0, weeklyLimit - weekRegularBefore));
  const weeklyOt = dailyRegular - straight;
  const ot = weeklyOt + dailyOt;
  const first = Math.min(ot, Math.max(0, 2 - otBefore));
  const rest = Math.max(0, ot - first);
  if (weeklyOt === 0)
    return [
      { hours: straight, key: null, label: "Regular hours", labelZh: "正常工時" },
      { hours: first, key: "tw.ot_first2", label: "Overtime hours 9-10", labelZh: "延長工時，第 9 至 10 小時" },
      { hours: rest, key: "tw.ot_next2", label: "Overtime after hour 10", labelZh: "延長工時，第 11 小時起" },
    ];
  const why = dailyOt > 0 ? `over ${weeklyLimit} a week and 8 a day` : `over ${weeklyLimit} hours this week`;
  const whyZh = dailyOt > 0 ? `本週超過 ${weeklyLimit} 小時且當天超過 8 小時` : `本週超過 ${weeklyLimit} 小時`;
  return [
    { hours: straight, key: null, label: "Regular hours", labelZh: "正常工時" },
    { hours: first, key: "tw.ot_first2", label: `Overtime hours 1-2 of the day (${why})`, labelZh: `延長工時前 2 小時（${whyZh}）`, extraKeys: ["tw.weekly_hours"] },
    { hours: rest, key: "tw.ot_next2", label: `Overtime after 2 hours (${why})`, labelZh: `延長工時第 3 小時起（${whyZh}）`, extraKeys: ["tw.weekly_hours"] },
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
  const assumptionsZh: string[] = [];
  /** Every assumption in both languages, so the two lists stay in step. */
  const assume = (en: string, zh?: string) => {
    assumptions.push(en);
    assumptionsZh.push(zh ?? en);
  };
  const missing = new Set<RuleKey>();
  let base = 0;
  let topUp = 0;
  let premiums = 0;
  let belowMin = 0;
  const stated = payslip.hourlyRate;
  if (stated === undefined)
    assume(
      tipped ? "No hourly rate found on the payslip. The minimum cash wage for tipped workers is used." : "No hourly rate found on the payslip. The minimum wage is used as the rate.",
      "薪資單上找不到時薪，先用最低工資當作時薪計算。",
    );

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
    let noteZh: string | undefined;
    if (seg.key) {
      const r = rule(rules, seg.key);
      if (r) {
        mult = r.value;
        keys.push(seg.key);
      } else {
        missing.add(seg.key);
        note = "Rule not retrieved: counted at straight time only.";
        noteZh = "沒有取得這條規定的官方條文，只按原時薪計算。";
      }
    }
    for (const k of seg.extraKeys || []) if (rule(rules, k)) keys.push(k);
    if (mw?.status === "pending_approval") {
      note = [note, "Minimum wage for this date is decided but still pending approval."].filter(Boolean).join(" ");
      noteZh = [noteZh, "這天適用的最低工資已決定，尚待行政院核定。"].filter(Boolean).join("");
    } else if (mw?.status === "cabinet_announced") {
      note = [note, `Minimum wage for this date: the Executive Yuan announced it on ${mw.statusDate}; formal notice not found yet.`].filter(Boolean).join(" ");
      noteZh = [noteZh, `這天適用的最低工資：行政院會 ${mw.statusDate} 已宣布，正式公告還沒看到。`].filter(Boolean).join("");
    }
    const amount = seg.hours * rate * mult;
    base += seg.hours * (stated ?? rate);
    topUp += seg.hours * (rate - (stated ?? rate));
    premiums += seg.hours * rate * (mult - 1);
    lines.push({ shiftId: s.id, date: s.date, label: seg.label, labelZh: seg.labelZh, hours: seg.hours, baseRate: rate, multiplier: mult, amount, ruleKeys: keys, note, noteZh });
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
    // A workday: the calendar date, or for the part of a night shift after
    // midnight, the date the shift started. Hours and overtime accumulate per
    // workday, so two shifts on one day (08-12 and 17-22) count together.
    const byId = new Map(shifts.map((s) => [s.id, s]));
    const workdayOf = (s: Shift) => (s.continuesFrom ? (byId.get(s.continuesFrom)?.date ?? s.date) : s.date);
    const day = new Map<string, { hours: number; ot: number; rest: number }>();
    for (const [, ws] of weekList) {
      let regularSoFar = 0;
      for (const s of ws) {
        const { rate, mw } = rateFor(s);
        const wd = workdayOf(s);
        const st = day.get(wd) ?? { hours: 0, ot: 0, rest: 0 };
        if (s.dayType === "workday") {
          const segs = twWorkdaySegments(s, regularSoFar, weekly?.value, st.hours, st.ot);
          for (const seg of segs) push(s, seg, rate, mw);
          regularSoFar += Math.max(0, Math.min(s.hours, 8 - st.hours));
          st.ot += segs.filter((x) => x.key).reduce((a, x) => a + x.hours, 0);
        } else if (s.dayType === "rest_day") {
          // Rest day tiers count rest day hours only.
          for (const seg of twSpecialSegments(s, st.rest)) push(s, seg, rate, mw);
          st.rest += s.hours;
        } else {
          for (const seg of twSpecialSegments(s, st.hours)) push(s, seg, rate, mw);
        }
        st.hours += s.hours;
        day.set(wd, st);
      }
    }
    for (const [wd, st] of [...day.entries()].sort())
      if (st.hours > 12)
        problems.push({
          kind: "check",
          message: `${wd}: ${Math.round(st.hours * 100) / 100} hours in one workday is over the 12-hour daily limit.`,
          messageZh: `${wd}：一天工作 ${Math.round(st.hours * 100) / 100} 小時，超過每日 12 小時的上限。`,
          ruleKeys: [],
        });
    for (const s of shifts) {
      if (s.dayType === "regular_day_off")
        problems.push({
          kind: "check",
          message: `${s.date}: work on the regular day off (例假) is only allowed for emergencies. Ask your labor bureau.`,
          messageZh: `${s.date}：例假只有在天災、事變或突發事件時才能要你上班。可以打 1955 問問看。`,
          ruleKeys: ["tw.day_off"],
        });
      if (s.holidayName && s.dayType !== "holiday")
        assume(
          `${s.date} is ${s.holidayName}, but it falls on your ${s.dayType.replace(/_/g, " ")}, so that day's rules apply. Your employer owes you a substitute day off (補假) for the holiday.`,
          `${s.date} 是${s.holidayName}，但這天是你的${DAYTYPE_ZH[s.dayType]}，所以按${DAYTYPE_ZH[s.dayType]}的規定計算；雇主應該另外給你一天補假。`,
        );
    }
    if (shifts.some((s) => s.continuesFrom))
      assume(
        "A shift that crosses midnight is split at 0:00: the hours after midnight count for the next calendar day (a holiday, rest day or day off is a calendar day), and both parts count as one workday for the 8-hour daily limit. A break is shared between the parts in proportion to their length.",
        "跨過午夜的班在 0 點切開：0 點以後的時數算隔天（國定假日、休息日、例假都以日曆日計算），但前後兩段合起來算同一個工作日的工時（每天 8 小時）。休息時間按兩段長短比例分攤。",
      );
    // LSA Art. 36: a regular day off in every 7 days. Flag 7 calendar days in a row with work.
    const run = longestRun([...new Set(shifts.filter((s) => s.hours > 0).map((s) => s.date))]);
    if (run.length >= 7)
      problems.push({
        id: "seven_days",
        kind: "check",
        message: `You worked ${run.length} days in a row (${run[0]} to ${run.at(-1)}). LSA Art. 36 requires a regular day off (例假) in every 7 days, except in a few industries the Ministry of Labor has approved. This does not change the amount above; the 1955 hotline can tell you more.`,
        messageZh: `你連續上了 ${run.length} 天班（${run[0]} 到 ${run.at(-1)}）。勞基法第 36 條規定每 7 天至少要有 1 天例假，只有少數經勞動部核定的行業可以調整。這不影響上面的金額，可以打 1955 問問看。`,
        ruleKeys: [],
      });
    assume(
      weekly
        ? `Taiwan: overtime counts hours beyond 8 a day or beyond ${weekly.value} a week. The workweek starts on ${WEEKDAY[startDay]}. Rest day and holiday hours have their own rates and do not count toward the ${weekly.value}. Flexible schedules (變形工時) are not checked.`
        : "Taiwan: overtime is counted per day only (hours beyond 8), because the weekly rule was not retrieved.",
      weekly
        ? `每天超過 8 小時、或每週超過 ${weekly.value} 小時的部分算延長工時（加班）。每週從${WEEKDAY_ZH[startDay]}起算。休息日與國定假日的工時另有算法，不算進 ${weekly.value} 小時。沒有檢查變形工時。`
        : "這次沒有取得「每週 40 小時」的條文，所以只按每天超過 8 小時算加班。",
    );
    if (shifts.some((s) => s.dayType === "holiday" && s.hours > 8))
      assume(
        "Holiday hours beyond 8 are counted as overtime under LSA Art. 24 (plus 1/3 for hours 9-10, plus 2/3 after), as the Ministry of Labor's Q&A on national holidays says (https://www.mol.gov.tw/1607/28690/2282/2284/2292/7239, read 2026-10-14).",
        "國定假日上班超過 8 小時的部分，依勞動部國定假日問答，算延長工時、按勞基法第 24 條加給（第 9 至 10 小時加給三分之一，之後加給三分之二）。出處：https://www.mol.gov.tw/1607/28690/2282/2284/2292/7239（2026-10-14 查閱）。",
      );
    if (shifts.some((s) => s.dayTypeSource === "default"))
      assume(
        "Days not marked otherwise are treated as normal workdays. If one of them was your rest day, more is owed.",
        "沒有特別標示的日子都當作一般工作日。如果其中一天其實是你的休息日，應領的會更多。",
      );
    const notYet = [...new Set(shifts.filter((s) => notYetHoliday(s.date.slice(5), s.date)).map((s) => s.date))];
    if (notYet.length)
      assume(
        `${notYet.join(", ")}: Teachers' Day (9/28), Retrocession Day (10/25) and Constitution Day (12/25) became national days off only from ${HOLIDAYS_ADDED_2025.from} (amendment promulgated 2025-05-28), so earlier dates count as normal days.`,
        `${notYet.join("、")}：教師節（9/28）、臺灣光復暨金門古寧頭大捷紀念日（10/25）、行憲紀念日（12/25）是 ${HOLIDAYS_ADDED_2025.from} 起（2025-05-28 修正公布）才放假，之前的日子按一般日子計算。`,
      );
    const outside = [...new Set(shifts.map((s) => s.date.slice(0, 4)))].filter((y) => !LUNAR_YEARS.includes(y));
    if (outside.length)
      assume(
        `Lunar-calendar holidays (Lunar New Year, Qingming, Dragon Boat, Mid-Autumn) are only known for ${LUNAR_YEARS.join(" and ")}. For ${outside.join(", ")}, mark them yourself with 國定假日.`,
        `農曆節日（春節、清明、端午、中秋）只內建 ${LUNAR_YEARS.join("、")} 年的日期。${outside.join("、")} 年的請在那一行加上「國定假日」。`,
      );
    assume(
      "If a holiday fell on your rest day or day off, the substitute day off (補假) is agreed with your employer. Fair Shift cannot know which day it is; mark it with 國定假日 if you worked it.",
      "國定假日遇到休息日或例假時，雇主要另給一天補假，哪一天由你們約定，這個工具不知道。如果你在補假那天上班，請在那一行加上「國定假日」。",
    );
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
          push(s, { hours: regular, key: null, label: "Regular hours", labelZh: "正常工時" }, rate, mw);
          push(s, { hours: ot, key: "ny.ot_weekly", label: "Overtime (over 40 in the week)", labelZh: "加班（本週超過 40 小時）" }, rate, mw);
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
        const noteZh = tc ? undefined : "沒有取得小費抵減的條文，先假設雇主扣的抵減合法。";
        if (regular > 0) {
          lines.push({
            shiftId: s.id,
            date: s.date,
            label: "Regular hours (cash wage after tip credit)",
            labelZh: "正常工時（扣掉小費抵減後的現金工資）",
            hours: regular,
            baseRate: regularRate,
            multiplier: 1,
            deduction: credit,
            amount: regular * cash,
            ruleKeys: keys,
            note,
            noteZh,
          });
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
            labelZh: "加班（本週超過 40 小時），小費員工算法",
            hours: ot,
            baseRate: regularRate,
            multiplier: mult,
            deduction: credit,
            amount,
            ruleKeys: [...keys, ...(r ? [r.key] : [])],
            note: r ? undefined : "Rule not retrieved: counted at straight time only.",
            noteZh: r ? undefined : "沒有取得這條規定的官方條文，只按原時薪計算。",
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
          labelZh: "小費加現金工資不到最低工資：雇主要補足差額",
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
          messageZh: "小費加上現金工資，沒有達到工時乘以最低工資，雇主要補足差額。",
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
        let noteZh: string | undefined;
        if (!hosp) {
          // 142-2.4: one hour at the minimum wage "in addition to the minimum wage
          // required": owed only to the extent day pay is below minimum wage x (hours + 1).
          const dayPay = dayHours * Math.max(stated ?? 0, mw.value);
          due = Math.max(0, mw.value * (dayHours + 1) - dayPay);
          note = "Only the part not already covered by pay above the minimum wage.";
          noteZh = "只算時薪高於最低工資的部分還沒補到的金額。";
          if (due <= 0) {
            assume(
              `${date}: the workday spread was ${spreadHours} hours, but pay above the minimum wage already covers the extra hour.`,
              `${date}：從上班到下班跨了 ${spreadHours} 小時，但時薪高於最低工資，已經涵蓋多付的那 1 小時。`,
            );
            continue;
          }
        }
        lines.push({
          shiftId: ds.at(-1)!.id,
          date,
          label: `Spread of hours ${spreadHours} (over ${spread.value}): one extra hour at the minimum wage`,
          labelZh: `工時跨度 ${spreadHours} 小時（超過 ${spread.value}）：多付 1 小時最低工資`,
          hours: 1,
          baseRate: due,
          multiplier: 1,
          amount: due,
          ruleKeys: [mw.key, spreadKey],
          note,
          noteZh,
        });
        premiums += due;
      }
    }

    assume(
      `New York: workweek starts on ${WEEKDAY[startDay]}. Region: ${NY_REGION_LABEL[region]}. Job: ${NY_JOB_LABEL[job]}.`,
      `紐約：每週從${WEEKDAY_ZH[startDay]}起算。地區：${NY_REGION_LABEL_ZH[region]}。工作類型：${NY_JOB_LABEL_ZH[job]}。`,
    );
    if (tipped) {
      assume(
        "Tipped job: the hourly rate on the payslip is read as your cash wage before tips, and the employer is assumed to take the full tip credit.",
        "小費工作：薪資單上的時薪當作不含小費的現金工資，並假設雇主扣了全額的小費抵減。",
      );
      if (payslip.tips === undefined) assume("No tips amount on the payslip, so it is assumed your tips covered the tip credit.", "薪資單上沒有小費金額，所以假設你的小費足夠抵減。");
    }
    assume(hosp ? "Call-in pay is not checked." : "Split shifts and call-in pay are not checked.", hosp ? "沒有檢查臨時叫班的報到工資。" : "沒有檢查拆班與臨時叫班的報到工資。");
  }

  const expectedTotal = round(lines.reduce((a, l) => a + l.amount, 0), currency);
  // Amounts use exact hours (50 minutes = 0.8333 h); shown hours are rounded to 0.01.
  for (const l of lines) l.hours = Math.round(l.hours * 100) / 100;
  const workedHours = Math.round(shifts.reduce((a, s) => a + s.hours, 0) * 100) / 100;
  const paidTotal = payslip.grossPaid;
  const shortfall = paidTotal !== undefined ? round(expectedTotal - paidTotal, currency) : undefined;

  for (const k of missing) {
    const sp = specByKey(k);
    problems.push({
      kind: "missing_rule",
      message: `No official source was retrieved for "${sp?.label ?? k}". Lines that need it are counted without it.`,
      messageZh: `這次沒有取得「${sp?.labelZh ?? k}」的官方條文，需要它的項目只按原時薪計算。`,
      ruleKeys: [k],
    });
  }
  if (belowMin > 0)
    problems.push({
      kind: "below_min_wage",
      message: tipped ? "The cash wage is below the minimum cash wage for tipped workers on some shifts." : "The stated hourly rate is below the minimum wage for some shifts.",
      messageZh: tipped ? "現金工資低於小費員工的最低現金工資。" : "薪資單上的時薪低於當時的最低工資。",
      amount: round(belowMin, currency),
      ruleKeys: [jurisdiction === "TW" ? "tw.min_wage_hourly" : tipped ? "ny.tip_credit" : "ny.min_wage_hourly"],
    });
  if (payslip.hoursPaid !== undefined && payslip.hoursPaid + 0.01 < workedHours)
    problems.push({
      kind: "unpaid_hours",
      message: `The payslip pays ${payslip.hoursPaid} hours, but the schedule shows ${workedHours} hours.`,
      messageZh: `薪資單只付了 ${payslip.hoursPaid} 小時，班表是 ${workedHours} 小時。`,
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
    const which = premiumKeys.map((k) => specByKey(k)).filter((x): x is NonNullable<typeof x> => !!x);
    problems.push({
      kind: "unpaid_premium",
      message: `Extra pay the rules require: ${[...new Set(which.map((x) => x.label.toLowerCase()))].join("; ")}.`,
      messageZh: `依規定應另計的加給：${[...new Set(which.map((x) => x.labelZh))].join("、")}。`,
      amount: round(premiums, currency),
      ruleKeys: premiumKeys,
    });
  }
  if (paidTotal === undefined) assume("No total paid amount found on the payslip, so no shortfall is calculated.", "薪資單上找不到實領金額，所以算不出差額。");

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
    assumptionsZh,
  };
}
