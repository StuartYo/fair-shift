import type { Citation } from "../types";

// Fair Shift data model. Money is computed by code from verified rule values;
// models only parse text, find sources, and explain.

export type Jurisdiction = "TW" | "US-NY";
export type NyRegion = "nyc" | "li_westchester" | "rest";
export type DayType = "workday" | "rest_day" | "regular_day_off" | "holiday";
/** New York job type. Tipped types are covered by the Hospitality Wage Order (12 NYCRR 146). */
export type NyJob = "general" | "hospitality" | "food_service" | "service";
export type TipVariant = "food_service" | "service";

export interface Shift {
  id: string; // sh1, sh2...
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM (may be next day)
  breakMinutes: number;
  hours: number; // computed by code
  dayType: DayType;
  dayTypeSource: "default" | "you" | "official_holiday";
  holidayName?: string;
  raw: string; // the input line it came from (redacted)
}

export interface Payslip {
  periodStart?: string;
  periodEnd?: string;
  hourlyRate?: number;
  hoursPaid?: number;
  grossPaid?: number;
  /** Tips received in the period (US tipped workers). Not part of wages paid. */
  tips?: number;
  currency: "TWD" | "USD";
}

export type RuleKey =
  | "tw.min_wage_hourly"
  | "tw.ot_first2"
  | "tw.ot_next2"
  | "tw.rest_first2"
  | "tw.rest_after2"
  | "tw.holiday"
  | "tw.day_off"
  | "tw.weekly_hours"
  | "ny.min_wage_hourly"
  | "ny.ot_weekly"
  | "ny.tip_credit"
  | "ny.ot_tipped"
  | "ny.spread_hosp"
  | "ny.spread_misc";

/** A rule value that passed code verification against retrieved text. */
export interface RuleRecord {
  key: RuleKey;
  value: number; // hourly amount, a pay multiplier, or an hours limit
  effectiveFrom?: string; // YYYY-MM-DD, required for minimum wages
  effectiveTo?: string;
  status: "in_force" | "pending_approval";
  region?: NyRegion;
  /** New York tip credit: which tipped job the rate is for. */
  variant?: TipVariant;
  citations: Citation[];
  recordedBy: "agent" | "code_fallback";
}

export interface HolidayRecord {
  monthDay: string; // MM-DD
  /** Set for lunar-calendar holidays, which move every year. */
  date?: string; // YYYY-MM-DD
  name: string;
  citations: Citation[]; // one for the date rule, one for the day off
  /** Where the solar date of a lunar holiday comes from (official calendar table in code). */
  dateSource?: { url: string; title: string; note: string };
  recordedBy: "agent" | "code_fallback";
}

export interface PayLine {
  shiftId: string;
  date: string;
  label: string;
  hours: number;
  baseRate: number; // hourly rate used (stated rate, or minimum wage if higher)
  multiplier: number;
  /** Per-hour amount subtracted after the multiplier (New York tip credit). */
  deduction?: number;
  amount: number;
  ruleKeys: RuleKey[];
  note?: string;
}

export interface Problem {
  kind: "below_min_wage" | "unpaid_premium" | "unpaid_hours" | "not_computed" | "missing_rule" | "check";
  message: string;
  amount?: number;
  ruleKeys: RuleKey[];
}

export interface Computation {
  currency: "TWD" | "USD";
  lines: PayLine[];
  expectedTotal: number;
  paidTotal?: number;
  shortfall?: number; // expected - paid, if paid known
  workedHours: number;
  components: { base: number; minWageTopUp: number; premiums: number };
  problems: Problem[];
  assumptions: string[];
}

export interface CheckInput {
  jurisdiction: Jurisdiction;
  nyRegion?: NyRegion;
  /** US-NY: job type. Default general. */
  nyJob?: NyJob;
  scheduleText: string;
  payslipText: string;
  /** TW: weekday (0=Sun..6=Sat) your employer set as rest day / regular day off, if known. */
  restDayWeekday?: number;
  dayOffWeekday?: number;
  /** First day of the workweek (0=Sun). Default Monday. Used for weekly overtime in both places. */
  workweekStart?: number;
}

export interface FairShiftReport {
  id: string;
  createdAt: string;
  mode: "live" | "mock";
  modeNote: string;
  input: { jurisdiction: Jurisdiction; nyRegion?: NyRegion; nyJob?: NyJob };
  shifts: Shift[];
  payslip: Payslip;
  parse: { source: "model" | "rules"; model?: string; crossCheck: string };
  rules: RuleRecord[];
  holidays: HolidayRecord[];
  computation: Computation;
  explanation: { text: string; messageToEmployer: string; source: "model" | "template"; model?: string };
  trace: import("../types").TraceStep[];
  usage: import("../types").Usage;
  modelsUsed: string[];
  redactions: number;
  disclaimer: string;
  stoppedEarly?: string;
}

export const DISCLAIMER =
  "Fair Shift is a checking aid, not legal advice. It uses the official rules it retrieved and the hours you entered. Confirm with your local labor department (Taiwan: 1955 hotline or your city labor bureau; New York: NYS DOL 888-469-7365) before acting.";
