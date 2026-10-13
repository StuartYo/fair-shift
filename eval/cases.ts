import type { CheckInput } from "../lib/wage/types";

// SYNTHETIC test data. Every schedule and payslip below is invented; no real
// person or employer. Expected values were computed by hand from the official
// rules recorded in fixtures/official-pages.json (see the "why" field).

export interface EvalCase {
  id: string;
  title: string;
  input: CheckInput;
  expected: {
    shifts: number;
    workedHours: number;
    expectedTotal: number;
    paidTotal: number;
    shortfall: number;
    minWageUsed: number;
    minWagePending?: boolean;
    holidayDates?: string[];
  };
  why: string;
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "tw-holiday-unpaid",
    title: "Taipei store clerk, worked National Day, paid straight time",
    input: {
      jurisdiction: "TW",
      scheduleText: "【10月班表】（範例資料）\n10/5(一) 17:00-22:00\n10/7(三) 下午5點到10點\n10/10(六) 10:00~16:00\n10/12(一) 17:00-23:00",
      payslipText: "薪資單 2026/10/01 - 2026/10/15\n時薪：196\n總工時：22 小時\n實發金額：4,312",
    },
    expected: { shifts: 4, workedHours: 22, expectedTotal: 5488, paidTotal: 4312, shortfall: 1176, minWageUsed: 196, holidayDates: ["2026-10-10"] },
    why: "16 h x 196 + 6 h x 196 x 2 (Art. 39, 國慶日 10-10) = 3136 + 2352 = 5488.",
  },
  {
    id: "tw-old-rate-overtime",
    title: "Still paid the 2025 rate in 2026, one overtime hour",
    input: {
      jurisdiction: "TW",
      scheduleText: "2026-10-13 09:00-19:00 休息60分\n2026-10-14 09:00-18:00 休息60分",
      payslipText: "期間 2026-10-13 至 2026-10-14\n時薪 190\n工時 17\n應發 3,230",
    },
    expected: { shifts: 2, workedHours: 17, expectedTotal: 3397, paidTotal: 3230, shortfall: 167, minWageUsed: 196 },
    why: "Rate raised to 196 (2026). 8 x 196 + 1 x 196 x 4/3 + 8 x 196 = 3397.33, rounded 3397.",
  },
  {
    id: "tw-rest-day",
    title: "Rest day shift paid as a normal day",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/15 (四) 18:00-22:00\n10/17 (六) 休息日 10:00-15:00",
      payslipText: "2026/10/15 - 2026/10/17\n時薪 200\n工時 9\n實發 1,800",
    },
    expected: { shifts: 2, workedHours: 9, expectedTotal: 2333, paidTotal: 1800, shortfall: 533, minWageUsed: 196 },
    why: "4 x 200 + rest day 2 x 200 x 4/3 + 3 x 200 x 5/3 = 800 + 533.33 + 1000 = 2333.33.",
  },
  {
    id: "tw-clean",
    title: "Clean: weekday shifts paid correctly",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/19 09:00-13:00\n10/20 09:00-13:00\n10/21 13:00-18:00",
      payslipText: "2026/10/19 - 2026/10/21\n時薪 210\n工時 13\n實發 2,730",
    },
    expected: { shifts: 3, workedHours: 13, expectedTotal: 2730, paidTotal: 2730, shortfall: 0, minWageUsed: 196 },
    why: "13 x 210 = 2730. Rate is above the minimum wage, no premium hours.",
  },
  {
    id: "tw-2027-pending",
    title: "January 2027 shifts at the 2026 rate (new rate decided, pending approval)",
    input: {
      jurisdiction: "TW",
      scheduleText: "1/5 17:00-22:00\n1/6 17:00-22:00",
      payslipText: "2027/01/01 - 2027/01/15\n時薪 196\n實發 1,960",
    },
    expected: { shifts: 2, workedHours: 10, expectedTotal: 2050, paidTotal: 1960, shortfall: 90, minWageUsed: 205, minWagePending: true },
    why: "MOL press release 2026-09-24: 205 from 2027-01-01, pending Executive Yuan approval. 10 x 205 = 2050.",
  },
  {
    id: "ny-weekly-overtime",
    title: "NYC barista, 42.5 hours in one week, no overtime paid",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      scheduleText: "Mon Oct 5 9am-6pm (30 min break)\nTue Oct 6 9am-6pm (30 min break)\nWed Oct 7 9am-6pm (30 min break)\nThu Oct 8 9am-6pm (30 min break)\nFri Oct 9 9am-6pm (30 min break)",
      payslipText: "Pay period 2026-10-05 to 2026-10-11 (sample)\nHourly rate: $17.00\nHours paid: 42.5\nGross pay: $722.50",
    },
    expected: { shifts: 5, workedHours: 42.5, expectedTotal: 743.75, paidTotal: 722.5, shortfall: 21.25, minWageUsed: 17 },
    why: "40 x 17 + 2.5 x 17 x 1.5 = 680 + 63.75 = 743.75 (P700: over 40 h at 1 1/2 times).",
  },
  {
    id: "ny-old-rate-upstate",
    title: "Upstate worker still on the 2025 rate",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "rest",
      scheduleText: "Oct 12 10:00-16:00\nOct 13 10:00-16:00\nOct 14 10:00-16:00",
      payslipText: "Period 2026-10-12 to 2026-10-18\nRate: $15.50\nHours: 18\nTotal pay: $279.00",
    },
    expected: { shifts: 3, workedHours: 18, expectedTotal: 288, paidTotal: 279, shortfall: 9, minWageUsed: 16 },
    why: "2026 rest-of-state minimum is $16.00 (P700). 18 x 16 = 288.",
  },
  {
    id: "ny-clean",
    title: "Clean: NYC part-timer paid above minimum, under 40 hours",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      scheduleText: "Oct 19 12:00-18:00\nOct 20 12:00-18:00\nOct 21 12:00-18:00\nOct 22 12:00-18:00\nOct 23 12:00-18:00",
      payslipText: "Period 2026-10-19 to 2026-10-25\nRate: $18.00\nHours: 30\nGross pay: $540.00",
    },
    expected: { shifts: 5, workedHours: 30, expectedTotal: 540, paidTotal: 540, shortfall: 0, minWageUsed: 17 },
    why: "30 x 18 = 540.",
  },
];
