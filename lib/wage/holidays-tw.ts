// Taiwan lunar-calendar national holidays, 2026 and 2027.
//
// The law (紀念日及節日實施條例 Art. 5 and 6) states these holidays by the lunar
// calendar or a solar term, so the solar date changes every year. The dates
// below were copied from the official government office calendars published by
// the Directorate-General of Personnel Administration (行政院人事行政總處, DGPA)
// and checked on 2026-10-14 against the calendar spreadsheets (lunar day labels
// and holiday shading):
//   115 (2026): https://www.dgpa.gov.tw/information?uid=30&pid=12573  (published 2025-06-13)
//   116 (2027): https://www.dgpa.gov.tw/information?uid=30&pid=12982  (published 2026-05-21)
//
// Why a table and not a computation: JavaScript's built-in Chinese calendar
// (Intl, ICU 78) puts lunar new year 2027 on 2027-02-07. The official DGPA
// calendar has it on 2027-02-06 (Saturday). A wrong day here would turn a
// doubled-pay holiday into a normal day, so the official table wins, and a test
// pins every date.
//
// Only the statutory holiday dates are listed. Government bridge days and
// substitute days off (補假, 調整放假) in the DGPA calendar apply to government
// offices; the same DGPA page says private employers follow the Labor Standards
// Act and agree days off with their workers. They are not listed here.
//
// The legal basis (which lunar day, and that it is a day off) is not taken from
// this file: it must be quoted from the act, retrieved during the run.

export interface LunarHoliday {
  date: string; // YYYY-MM-DD
  name: string;
  /** Which clause of the act covers it. */
  group: "spring" | "qingming" | "dragon_boat" | "mid_autumn";
  /** The lunar day, in plain words, for display. */
  lunar: string;
}

export const DGPA_CALENDARS: Record<string, { url: string; title: string }> = {
  "2026": {
    url: "https://www.dgpa.gov.tw/information?uid=30&pid=12573",
    title: "中華民國一百一十五年政府行政機關辦公日曆表 (DGPA, 2025-06-13)",
  },
  "2027": {
    url: "https://www.dgpa.gov.tw/information?uid=30&pid=12982",
    title: "中華民國一百一十六年政府行政機關辦公日曆表 (DGPA, 2026-05-21)",
  },
};

export const LUNAR_HOLIDAYS: LunarHoliday[] = [
  // 2026 (lunar year 丙午 starts 2026-02-17)
  { date: "2026-02-15", name: "除夕前一日", group: "spring", lunar: "day before New Year's Eve (lunar 12/28)" },
  { date: "2026-02-16", name: "除夕", group: "spring", lunar: "New Year's Eve (lunar 12/29, last day of the month)" },
  { date: "2026-02-17", name: "春節", group: "spring", lunar: "lunar 1/1" },
  { date: "2026-02-18", name: "春節", group: "spring", lunar: "lunar 1/2" },
  { date: "2026-02-19", name: "春節", group: "spring", lunar: "lunar 1/3" },
  { date: "2026-04-05", name: "清明節", group: "qingming", lunar: "Qingming solar term" },
  { date: "2026-06-19", name: "端午節", group: "dragon_boat", lunar: "lunar 5/5" },
  { date: "2026-09-25", name: "中秋節", group: "mid_autumn", lunar: "lunar 8/15" },
  // 2027 (lunar year 丁未 starts 2027-02-06)
  { date: "2027-02-04", name: "除夕前一日", group: "spring", lunar: "day before New Year's Eve (lunar 12/28)" },
  { date: "2027-02-05", name: "除夕", group: "spring", lunar: "New Year's Eve (lunar 12/29, last day of the month)" },
  { date: "2027-02-06", name: "春節", group: "spring", lunar: "lunar 1/1" },
  { date: "2027-02-07", name: "春節", group: "spring", lunar: "lunar 1/2" },
  { date: "2027-02-08", name: "春節", group: "spring", lunar: "lunar 1/3" },
  { date: "2027-04-05", name: "清明節", group: "qingming", lunar: "Qingming solar term" },
  { date: "2027-06-09", name: "端午節", group: "dragon_boat", lunar: "lunar 5/5" },
  { date: "2027-09-15", name: "中秋節", group: "mid_autumn", lunar: "lunar 8/15" },
];

/** Years the table covers. Shifts outside them get an assumption note. */
export const LUNAR_YEARS = Object.keys(DGPA_CALENDARS);

export function lunarHolidayOn(date: string): LunarHoliday | undefined {
  return LUNAR_HOLIDAYS.find((h) => h.date === date);
}

/**
 * Text that must appear in the quotes for each group, so a quote about one
 * holiday cannot be reused for another. `rule` is the date rule, `off` the
 * day-off clause. For the spring holidays one clause of Art. 6 states both.
 */
export const LUNAR_QUOTE_RULES: Record<LunarHoliday["group"], { rule: RegExp; off: RegExp }> = {
  spring: { rule: /除夕及春節[:：]?自農曆十二月末日之前一日至翌年一月三日/, off: /放假五日/ },
  qingming: { rule: /清明節[:：]定於清明日/, off: /清明節[^：:]*[:：]均放假一日/ },
  dragon_boat: { rule: /端午節[:：]農曆五月五日/, off: /端午節[^：:]*[:：]均放假一日/ },
  mid_autumn: { rule: /中秋節[:：]農曆八月十五日/, off: /中秋節[:：]均放假一日/ },
};
