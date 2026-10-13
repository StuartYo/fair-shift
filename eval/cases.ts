import type { CheckInput, RuleKey } from "../lib/wage/types";

// SYNTHETIC test data. Every schedule and payslip below is invented; no real
// person or employer.
//
// How the truth values were made: by hand, by the author, from the official
// rule text in fixtures/official-pages.json (Taiwan Ministry of Labor rates,
// Labor Standards Act Art. 24, 39, 40, Enforcement Rules Art. 20-1, the holiday
// act on the DGPA calendar pages; NYS DOL P700 and wage orders CR146 / CR142).
// Each case's "why" field is the full arithmetic: hours per day from the
// schedule, which rule applies to which hours, the multiplier, the sum, and the
// rounding (Taiwan: nearest dollar; New York: cents). Fair Shift's own code was
// not used to produce them. Groups:
//  - main: the first 13 cases, clean formats.
//  - messy: 5 schedules typed the way people really send them (LINE messages
//    without dates, "18-22", "休1小時", overnight shifts, full-width digits,
//    a texted English schedule).
//  - heldout (eval/heldout.ts): written and committed before the first run that
//    included them, expected values frozen in that commit.

export interface EvalCase {
  id: string;
  title: string;
  group?: "main" | "messy" | "heldout";
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
    /** Rules that must appear on the pay lines. */
    ruleKeys?: RuleKey[];
  };
  why: string;
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "tw-holiday-unpaid",
    title: "Taipei store clerk, worked National Day, paid straight time",
    input: {
      jurisdiction: "TW",
      // The sample's employer set Thursday as the rest day and Sunday as the regular day off.
      restDayWeekday: 4,
      dayOffWeekday: 0,
      scheduleText: "【10月班表】（範例資料）\n10/5(一) 17:00-22:00\n10/7(三) 下午5點到10點\n10/10(六) 10:00~16:00\n10/12(一) 17:00-23:00",
      payslipText: "薪資單 2026/10/01 - 2026/10/15\n時薪：196\n總工時：22 小時\n實發金額：4,312",
    },
    expected: { shifts: 4, workedHours: 22, expectedTotal: 5488, paidTotal: 4312, shortfall: 1176, minWageUsed: 196, holidayDates: ["2026-10-10"] },
    why: "Rest day Thursday, day off Sunday, so Saturday 10-10 is a workday that is a national holiday. 16 h x 196 + 6 h x 196 x 2 (Art. 39, 國慶日 10-10) = 3136 + 2352 = 5488.",
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
    id: "tw-weekly-40",
    title: "Part-timer, six 7-hour days in one week, hours over 40 paid as straight time",
    input: {
      jurisdiction: "TW",
      scheduleText:
        "10/19(一) 10:00-17:30 休息30分\n10/20(二) 10:00-17:30 休息30分\n10/21(三) 10:00-17:30 休息30分\n10/22(四) 10:00-17:30 休息30分\n10/23(五) 10:00-17:30 休息30分\n10/24(六) 10:00-17:30 休息30分",
      payslipText: "薪資單 2026/10/19 - 2026/10/25\n時薪 200\n總工時 42\n實發 8,400",
    },
    expected: { shifts: 6, workedHours: 42, expectedTotal: 8533, paidTotal: 8400, shortfall: 133, minWageUsed: 196, ruleKeys: ["tw.weekly_hours", "tw.ot_first2"] },
    why: "LSA Enforcement Rules Art. 20-1: hours over 40 a week are overtime. Mon-Fri 35 h; Saturday 5 h reach 40, 2 h over at 4/3 (Art. 24). 40 x 200 + 2 x 200 x 4/3 = 8000 + 533.33 = 8533.33, rounded 8533.",
  },
  {
    id: "tw-mid-autumn-2026",
    title: "Worked Mid-Autumn Festival 2026 (lunar holiday), paid straight time",
    input: {
      jurisdiction: "TW",
      scheduleText: "9/24(四) 17:00-22:00\n9/25(五) 中秋 17:00-22:00",
      payslipText: "薪資單 2026/09/16 - 2026/09/30\n時薪：196\n總工時：10 小時\n實發金額：1,960",
    },
    expected: { shifts: 2, workedHours: 10, expectedTotal: 2940, paidTotal: 1960, shortfall: 980, minWageUsed: 196, holidayDates: ["2026-09-25"], ruleKeys: ["tw.holiday"] },
    why: "Mid-Autumn is lunar 8/15 = 2026-09-25 (DGPA 115 calendar), a day off under 紀念日及節日實施條例 Art. 6. 5 x 196 + 5 x 196 x 2 (Art. 39) = 980 + 1960 = 2940.",
  },
  {
    id: "tw-lunar-new-year-2027",
    title: "Lunar New Year 2027: two holiday shifts and one normal day, all paid straight time",
    input: {
      jurisdiction: "TW",
      scheduleText: "2027/2/4(四) 17:00-22:00\n2027/2/5(五) 10:00-15:00\n2027/2/10(三) 17:00-22:00",
      payslipText: "薪資單 2027/02/01 - 2027/02/15\n時薪：205\n總工時：15 小時\n實發金額：3,075",
    },
    expected: {
      shifts: 3,
      workedHours: 15,
      expectedTotal: 5125,
      paidTotal: 3075,
      shortfall: 2050,
      minWageUsed: 205,
      minWagePending: true,
      holidayDates: ["2027-02-04", "2027-02-05"],
      ruleKeys: ["tw.holiday"],
    },
    why: "DGPA 116 calendar: New Year's Eve is 2027-02-05, so the 5-day holiday (Art. 6: from the day before New Year's Eve to lunar 1/3) runs 02-04 to 02-08. 02-10 is a government substitute day, not a statutory holiday. 5 x 205 x 2 + 5 x 205 x 2 + 5 x 205 = 5125.",
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
    id: "ny-tipped-overtime",
    title: "NYC food server, 42 hours, overtime paid at 1.5x the cash wage instead of 1.5x the full rate",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "food_service",
      scheduleText:
        "Mon Oct 19 10am-7pm (30 min break)\nTue Oct 20 10am-7pm (30 min break)\nWed Oct 21 10am-7pm (30 min break)\nThu Oct 22 10am-7pm (30 min break)\nFri Oct 23 10am-6:30pm (30 min break)",
      payslipText: "Pay period 2026-10-19 to 2026-10-25 (sample)\nHourly rate: $11.35 (cash wage, tip credit taken)\nHours paid: 42\nGross wages: $476.70\nTips reported: $610.00",
    },
    expected: { shifts: 5, workedHours: 42, expectedTotal: 493.7, paidTotal: 476.7, shortfall: 17, minWageUsed: 17, ruleKeys: ["ny.tip_credit", "ny.ot_tipped"] },
    why: "12 NYCRR 146-1.3: NYC food service tip credit $5.65, cash wage $11.35 (2026). 146-1.4: overtime = 1.5 x $17.00 - $5.65 = $19.85. 40 x 11.35 + 2 x 19.85 = 454.00 + 39.70 = 493.70. Tips $610 + cash $476.70 cover 42 x $17.00 = $714.",
  },
  {
    id: "ny-spread-of-hours",
    title: "NYC line cook, split shift spanning 12 hours, no spread-of-hours pay",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "hospitality",
      scheduleText: "Thu Oct 22 10:00-16:00\nSat Oct 24 10:00-14:00\nSat Oct 24 17:00-22:00",
      payslipText: "Pay period 2026-10-19 to 2026-10-25 (sample)\nHourly rate: $17.50\nHours paid: 15\nGross pay: $262.50",
    },
    expected: { shifts: 3, workedHours: 15, expectedTotal: 279.5, paidTotal: 262.5, shortfall: 17, minWageUsed: 17, ruleKeys: ["ny.spread_hosp"] },
    why: "12 NYCRR 146-1.6: restaurant workday 10:00 to 22:00 is a 12-hour spread (over 10), so one extra hour at the $17.00 minimum wage, whatever the pay rate. 15 x 17.50 + 17.00 = 279.50.",
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
  // ---- messy formats ----
  {
    id: "tw-messy-line-weekdays",
    group: "messy",
    title: "LINE message with weekdays only, 18-22 style hours, 休1小時",
    input: {
      jurisdiction: "TW",
      scheduleText: "店長：下週班表喔～\n週一 18-22\n週三 18-22\n週五 18-22\n週六 12-20 休1小時",
      payslipText: "薪資明細 2026/10/19-2026/10/25\n時薪 200\n工時 19\n實發 3,800",
    },
    expected: { shifts: 4, workedHours: 19, expectedTotal: 3800, paidTotal: 3800, shortfall: 0, minWageUsed: 196 },
    why: "Pay period 10/19 (Mon) to 10/25: 週一 = 10/19, 週三 = 10/21, 週五 = 10/23, 週六 = 10/24. Hours 4 + 4 + 4 + (8 - 1 break) = 19, none over 8 a day or 40 a week. 19 x 200 = 3800, paid correctly. Tests that 休1小時 is a break and that no shortfall is invented.",
  },
  {
    id: "tw-messy-overnight",
    group: "messy",
    title: "Overnight shifts ending after midnight, paid as 6 hours each",
    input: {
      jurisdiction: "TW",
      scheduleText: "大夜班\n10/16(五) 22:00-06:00 休1小時（跨夜）\n10/17(六) 22:00～06:00 休息1小時",
      payslipText: "2026/10/16 - 2026/10/18\n時薪 196\n工時 12\n實發 2,352",
    },
    expected: { shifts: 2, workedHours: 14, expectedTotal: 2744, paidTotal: 2352, shortfall: 392, minWageUsed: 196 },
    why: "Each shift 22:00 to 06:00 next day = 8 h minus 1 h break = 7 h; 14 h at 196 = 2744. No day over 8 h, week under 40 h. Paid 12 h x 196 = 2352. Shortfall 392.",
  },
  {
    id: "tw-messy-chinese-times",
    group: "messy",
    title: "Times written in words (晚上6點到11點), rate below minimum wage",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/26 晚上6點到11點\n10/27 下午2點半到晚上9點半 休息30分鐘\n10/28 早上9點到下午1點",
      payslipText: "2026/10/26 - 2026/10/31\n時薪 190\n工時 15.5\n實發 2,945",
    },
    expected: { shifts: 3, workedHours: 15.5, expectedTotal: 3038, paidTotal: 2945, shortfall: 93, minWageUsed: 196 },
    why: "18:00-23:00 = 5 h; 14:30-21:30 minus 30 min = 6.5 h; 09:00-13:00 = 4 h; total 15.5 h. Rate 190 is below the 2026 minimum of 196, so 15.5 x 196 = 3038. Paid 15.5 x 190 = 2945. Shortfall 93.",
  },
  {
    id: "tw-messy-fullwidth",
    group: "messy",
    title: "Full-width digits and punctuation, one half hour not paid",
    input: {
      jurisdiction: "TW",
      scheduleText: "１０／２９（四）　１７：００～２２：００\n１０／３０（五）　１７：００～２２：３０",
      payslipText: "期間：２０２６／１０／２９－２０２６／１０／３１\n時薪：２００\n工時：１０\n實發：２，０００",
    },
    expected: { shifts: 2, workedHours: 10.5, expectedTotal: 2100, paidTotal: 2000, shortfall: 100, minWageUsed: 196 },
    why: "17:00-22:00 = 5 h; 17:00-22:30 = 5.5 h; total 10.5 h x 200 = 2100. Paid 10 h x 200 = 2000. Shortfall 100.",
  },
  {
    id: "ny-messy-text",
    group: "messy",
    title: "Texted schedule (mon 10/19 5-10pm), NYC rate below minimum",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      scheduleText: "hey here's next week\nmon 10/19 5-10pm\nwed 10/21 5-10pm\nsat 10/24 11am-7pm 30min break",
      payslipText: "Period 2026-10-19 to 2026-10-25\nRate: $16.50\nHours: 17.5\nGross pay: $288.75",
    },
    expected: { shifts: 3, workedHours: 17.5, expectedTotal: 297.5, paidTotal: 288.75, shortfall: 8.75, minWageUsed: 17 },
    why: "17:00-22:00 = 5 h twice; 11:00-19:00 minus 30 min = 7.5 h; total 17.5 h. NYC 2026 minimum is $17.00 (P700), so 17.5 x 17.00 = 297.50. Paid 17.5 x 16.50 = 288.75. Shortfall 8.75.",
  },
];
