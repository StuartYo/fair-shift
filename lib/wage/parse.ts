import type { Payslip, Shift } from "./types";

// Two parsers for messy schedules and payslips:
//  - parseScheduleRules: deterministic, handles common formats (used in demo
//    mode and as a cross-check on the model's parse in live mode).
//  - normaliseModelShifts: validates the JSON the model returns; code computes
//    the hours, never the model.

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function toMinutes(h: number, m: number, ampm?: string): number {
  let hh = h;
  if (ampm) {
    const a = ampm.toLowerCase();
    if ((a === "pm" || a === "下午" || a === "晚上") && hh < 12) hh += 12;
    if ((a === "am" || a === "上午" || a === "早上") && hh === 12) hh = 0;
  }
  return hh * 60 + m;
}

export function shiftHours(start: string, end: string, breakMinutes: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // overnight
  return Math.max(0, Math.round(((mins - breakMinutes) / 60) * 100) / 100);
}

const TIME = String.raw`(上午|下午|晚上|早上)?\s*(\d{1,2})(?:[:：](\d{2})|點(半|\d{1,2})?分?)?\s*(am|pm)?`;

function minutePart(colon?: string, cn?: string): number {
  if (colon) return Number(colon);
  if (cn === "半") return 30;
  return cn ? Number(cn) : 0;
}
const RANGE = new RegExp(`${TIME}\\s*(?:-|~|～|–|—|to|至|到)\\s*${TIME}`, "i");

function findDate(line: string, year: number): string | null {
  let m = line.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = line.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日號号]/);
  if (m) return `${year}-${pad(+m[1])}-${pad(+m[2])}`;
  m = line.match(/(?:^|[^\d:])(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (m) return `${year}-${pad(+m[1])}-${pad(+m[2])}`;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  m = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i);
  if (m) return `${year}-${pad(months.indexOf(m[1].toLowerCase()) + 1)}-${pad(+m[2])}`;
  return null;
}

function findBreak(line: string): number {
  // 休息60分, 午休 30 分鐘, 休1小時, break 30 min, lunch 1h
  let m = line.match(/(?:休息|午休|休|break|lunch)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(分鐘|分|min|mins|minutes|小時|鐘頭|h|hr|hrs|hours?)/i);
  if (m) return /小時|鐘頭|h/i.test(m[2]) && !/min/i.test(m[2]) ? Math.round(Number(m[1]) * 60) : Math.round(Number(m[1]));
  m = line.match(/(\d+(?:\.\d+)?)\s*(分鐘|min|mins|minutes|小時|h|hr|hrs|hours?)\s*(?:的)?\s*(?:休息|break|lunch)/i);
  if (m) return /小時|h/i.test(m[2]) && !/min/i.test(m[2]) ? Math.round(Number(m[1]) * 60) : Math.round(Number(m[1]));
  return 0;
}

function marker(line: string): Shift["dayType"] | null {
  if (/國定假日|國假|holiday/i.test(line)) return "holiday";
  if (/例假|regular day off/i.test(line)) return "regular_day_off";
  if (/休息日|rest day/i.test(line)) return "rest_day";
  return null;
}

const ZH_WEEKDAY: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const EN_WEEKDAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Weekday named on a line without a date: 週五, 星期六, 禮拜天, fri, Saturday. */
export function findWeekday(line: string): number | null {
  const m = line.match(/(?:週|周|星期|禮拜)\s*([日天一二三四五六])/);
  if (m) return ZH_WEEKDAY[m[1]];
  const e = line.match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?(?![a-z])/i);
  if (e) return EN_WEEKDAY.indexOf(e[1].toLowerCase());
  return null;
}

export interface RawShift {
  date: string;
  start: string;
  end: string;
  breakMinutes: number;
  marked: Shift["dayType"] | null;
  raw: string;
}

export interface ScheduleParse {
  shifts: RawShift[];
  /** Lines that look like a shift (they have a time range) but could not be read, with the reason. */
  unread: { line: string; reason: "no_date" | "weekday_ambiguous" }[];
}

function datesInPeriod(period?: { start?: string; end?: string }): string[] {
  if (!period?.start || !period.end || !isValidDate(period.start) || !isValidDate(period.end) || period.end < period.start) return [];
  const out: string[] = [];
  const d = new Date(period.start + "T00:00:00Z");
  for (let i = 0; i < 62; i++) {
    const s = d.toISOString().slice(0, 10);
    if (s > period.end) break;
    out.push(s);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Rule-based schedule parser. Lines with a weekday but no date ("週五 18-22")
 * are placed in the pay period when exactly one day of the period falls on
 * that weekday; otherwise they are reported as unread, never guessed.
 */
export function parseScheduleDetailed(text: string, year: number, period?: { start?: string; end?: string }): ScheduleParse {
  const shifts: RawShift[] = [];
  const unread: ScheduleParse["unread"] = [];
  const periodDates = datesInPeriod(period);
  for (const original of text.split(/\r?\n/)) {
    const line = original.normalize("NFKC");
    let date = findDate(line, year);
    if (date && !isValidDate(date)) date = null;
    const r = line.replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/, " ").replace(/(?:^|[^\d:])\d{1,2}\/\d{1,2}(?![\d/])/, " ").match(RANGE);
    if (!r) continue;
    if (!date) {
      const wd = findWeekday(line);
      const hits = wd === null ? [] : periodDates.filter((d) => new Date(d + "T00:00:00Z").getUTCDay() === wd);
      if (hits.length === 1) date = hits[0];
      else {
        unread.push({ line: original.trim().slice(0, 120), reason: wd === null ? "no_date" : "weekday_ambiguous" });
        continue;
      }
    }
    const startAmpm = r[1] || r[5];
    let endAmpm = r[6] || r[10];
    // "下午5點-10點" -> the end inherits the afternoon marker
    if (!endAmpm && (r[1] === "下午" || r[1] === "晚上") && Number(r[7]) < 12) endAmpm = r[1];
    let startMin = toMinutes(Number(r[2]), minutePart(r[3], r[4]), startAmpm);
    const endMin = toMinutes(Number(r[7]), minutePart(r[8], r[9]), endAmpm);
    // "5-10pm" -> the start inherits pm when that keeps the shift in order
    if (!startAmpm && endAmpm && /pm|下午|晚上/i.test(endAmpm) && Number(r[2]) < 12 && startMin + 720 < endMin) startMin += 720;
    if (startMin > 24 * 60 || endMin > 24 * 60) {
      unread.push({ line: original.trim().slice(0, 120), reason: "no_date" });
      continue;
    }
    const fmt = (m: number) => `${pad(Math.floor((m % 1440) / 60))}:${pad(m % 60)}`;
    shifts.push({ date, start: fmt(startMin), end: fmt(endMin), breakMinutes: findBreak(line), marked: marker(line), raw: original.trim() });
  }
  return { shifts, unread };
}

export function parseScheduleRules(text: string, year: number, period?: { start?: string; end?: string }): RawShift[] {
  return parseScheduleDetailed(text, year, period).shifts;
}

export function parsePayslipRules(text: string, currency: Payslip["currency"]): Payslip {
  const p: Payslip = { currency };
  const t = text.normalize("NFKC");
  const rate = t.match(/(時薪|hourly rate|rate|pay rate)\s*[:：]?\s*(?:NT\$|US\$|\$)?\s*(\d+(?:\.\d+)?)/i);
  if (rate) p.hourlyRate = Number(rate[2]);
  const hours = t.match(/(總工時|工時|時數|hours paid|paid hours|hours)\s*[:：]?\s*(\d+(?:\.\d+)?)/i);
  if (hours) p.hoursPaid = Number(hours[2]);
  // Lines about tips are never the wages paid.
  const wageText = t
    .split(/\r?\n/)
    .filter((l) => !/tip|小費/i.test(l))
    .join("\n");
  const gross = wageText.match(/(實發金額|實發|應發|薪資總額|總計|合計|gross pay|gross wages|gross|total pay|wages paid|net pay|total)\s*[:：]?\s*(?:NT\$|US\$|\$)?\s*([\d,]+(?:\.\d+)?)/i);
  if (gross) p.grossPaid = Number(gross[2].replace(/,/g, ""));
  const tips = t.match(/(tips? (?:received|reported|total)|tips?|小費)\s*[:：]?\s*(?:NT\$|US\$|\$)?\s*([\d,]+(?:\.\d+)?)/i);
  if (tips) p.tips = Number(tips[2].replace(/,/g, ""));
  const dates = [...t.matchAll(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g)].map((m) => `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`);
  if (dates.length >= 2) {
    p.periodStart = dates[0];
    p.periodEnd = dates[1];
  }
  return p;
}

export interface ModelShift {
  date?: string;
  start?: string;
  end?: string;
  break_minutes?: number;
  marked?: string;
  source_line?: string;
}

/** Validate the model's parse. Invalid rows are dropped and reported. */
export function normaliseModelShifts(rows: ModelShift[]): { shifts: RawShift[]; dropped: number } {
  const shifts: RawShift[] = [];
  let dropped = 0;
  for (const r of rows.slice(0, 62)) {
    const ok =
      typeof r.date === "string" &&
      isValidDate(r.date) &&
      /^\d{2}:\d{2}$/.test(r.start || "") &&
      /^\d{2}:\d{2}$/.test(r.end || "") &&
      Number(r.start!.slice(0, 2)) < 24 &&
      Number(r.end!.slice(0, 2)) < 24;
    if (!ok) {
      dropped++;
      continue;
    }
    const m = (r.marked || "").toLowerCase();
    shifts.push({
      date: r.date!,
      start: r.start!,
      end: r.end!,
      breakMinutes: Math.max(0, Math.min(600, Math.round(Number(r.break_minutes) || 0))),
      marked: m === "holiday" ? "holiday" : m === "rest_day" ? "rest_day" : m === "regular_day_off" ? "regular_day_off" : null,
      raw: String(r.source_line || "").slice(0, 200),
    });
  }
  return { shifts, dropped };
}

export function crossCheck(a: RawShift[], b: RawShift[]): string {
  if (b.length === 0) return "No rule-based parse to compare with.";
  const key = (s: RawShift) => `${s.date} ${s.start}-${s.end} ${s.breakMinutes}`;
  const sa = new Set(a.map(key));
  const sb = new Set(b.map(key));
  const onlyA = [...sa].filter((k) => !sb.has(k)).length;
  const onlyB = [...sb].filter((k) => !sa.has(k)).length;
  if (onlyA === 0 && onlyB === 0) return `Model parse and rule-based parse agree on all ${a.length} shifts.`;
  return `Model parse and rule-based parse differ on ${Math.max(onlyA, onlyB)} shift(s). Check the shift table.`;
}
