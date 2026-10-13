import type { EvalCase } from "./cases";

// HELD-OUT cases. SYNTHETIC data, no real person or employer.
//
// Written after the main and messy cases, and committed with their expected
// values before any run of Fair Shift on them (see the git history of this
// file). The truth values are hand arithmetic from the official rule text, the
// same method as eval/cases.ts; the "why" field shows it. They are not used in
// the UI samples and were not used while tuning prompts or parsers.

export const HELDOUT_CASES: EvalCase[] = [
  {
    id: "ho-tw-dragon-boat-2027",
    group: "heldout",
    title: "Dragon Boat Festival 2027 (lunar holiday) at the pending 2027 rate",
    input: {
      jurisdiction: "TW",
      scheduleText: "2027/6/8 17:00-21:00\n2027/6/9 端午 11:00-19:00 休息1小時",
      payslipText: "薪資單 2027/06/01 - 2027/06/15\n時薪 205\n工時 11\n實發 2,255",
    },
    expected: { shifts: 2, workedHours: 11, expectedTotal: 3690, paidTotal: 2255, shortfall: 1435, minWageUsed: 205, minWagePending: true, holidayDates: ["2027-06-09"], ruleKeys: ["tw.holiday"] },
    why: "端午節 is lunar 5/5 = 2027-06-09 (DGPA 116 calendar), a day off under 紀念日及節日實施條例 Art. 6. 6/8: 4 h x 205 = 820. 6/9: 8 h minus 1 h break = 7 h x 205 x 2 (Art. 39) = 2870. Total 3690. Paid 11 x 205 = 2255. Shortfall 1435.",
  },
  {
    id: "ho-tw-labor-day-2026",
    group: "heldout",
    title: "Labor Day 2026 worked, paid straight time",
    input: {
      jurisdiction: "TW",
      scheduleText: "2026/5/1(五) 09:00-18:00 休息1小時\n2026/5/4(一) 09:00-13:00",
      payslipText: "薪資單 2026/05/01 - 2026/05/15\n時薪 196\n工時 12\n實發 2,352",
    },
    expected: { shifts: 2, workedHours: 12, expectedTotal: 3920, paidTotal: 2352, shortfall: 1568, minWageUsed: 196, holidayDates: ["2026-05-01"], ruleKeys: ["tw.holiday"] },
    why: "勞動節 5/1 is a day off for all workers (紀念日及節日實施條例 Art. 5 and 6 as quoted on the DGPA 115 calendar page). 5/1: 9 h minus 1 h break = 8 h x 196 x 2 = 3136. 5/4: 4 h x 196 = 784. Total 3920. Paid 12 x 196 = 2352. Shortfall 1568.",
  },
  {
    id: "ho-tw-eleven-hour-day",
    group: "heldout",
    title: "One 11-hour workday, both overtime tiers unpaid",
    input: {
      jurisdiction: "TW",
      scheduleText: "11/2(一) 08:00-20:00 午休1小時",
      payslipText: "期間 2026/11/02 - 2026/11/08\n時薪 200\n工時 11\n實發 2,200",
    },
    expected: { shifts: 1, workedHours: 11, expectedTotal: 2467, paidTotal: 2200, shortfall: 267, minWageUsed: 196, ruleKeys: ["tw.ot_first2", "tw.ot_next2"] },
    why: "12 h minus 1 h lunch = 11 h. Art. 24: 8 h x 200 = 1600; hours 9-10: 2 x 200 x 4/3 = 533.33; hour 11: 1 x 200 x 5/3 = 333.33. Total 2466.67, rounded 2467. Paid 11 x 200 = 2200. Shortfall 267.",
  },
  {
    id: "ho-tw-holiday-on-rest-day",
    group: "heldout",
    title: "National Day falls on the worker's rest day (Saturday): rest day rates apply",
    input: {
      jurisdiction: "TW",
      restDayWeekday: 6,
      dayOffWeekday: 0,
      scheduleText: "10/6(二) 17:00-22:00\n10/10(六) 09:00-15:00\n10/13(二) 17:00-22:00",
      payslipText: "薪資單 2026/10/01 - 2026/10/15\n時薪 200\n工時 16\n實發 3,200",
    },
    expected: { shifts: 3, workedHours: 16, expectedTotal: 3867, paidTotal: 3200, shortfall: 667, minWageUsed: 196, ruleKeys: ["tw.rest_first2", "tw.rest_after2"] },
    why: "Rest day is Saturday, so 10/10 (國慶日) is paid as rest day work and the employer owes a substitute day off (MOL 2026-10-07 notice). 10/6 and 10/13: 10 h x 200 = 2000. 10/10: 6 h, first 2 h x 200 x 4/3 = 533.33, next 4 h x 200 x 5/3 = 1333.33 (Art. 24 para. 2). Total 3866.67, rounded 3867. Paid 16 x 200 = 3200. Shortfall 667.",
  },
  {
    id: "ho-ny-li-overtime",
    group: "heldout",
    title: "Long Island warehouse worker, 44 hours, overtime paid straight",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "li_westchester",
      scheduleText: "Mon Oct 26 8:00-18:00\nTue Oct 27 8:00-18:00\nWed Oct 28 8:00-18:00\nThu Oct 29 8:00-18:00\nFri Oct 30 8:00-12:00",
      payslipText: "Pay period 2026-10-26 to 2026-11-01\nHourly rate: $17.50\nHours paid: 44\nGross pay: $770.00",
    },
    expected: { shifts: 5, workedHours: 44, expectedTotal: 805, paidTotal: 770, shortfall: 35, minWageUsed: 17 },
    why: "4 days of 10 h plus 4 h = 44 h. Long Island and Westchester minimum 2026 is $17.00 (P700); rate 17.50 is above it. 40 x 17.50 = 700; 4 h over 40 at 1.5 x 17.50 = 105. Total 805. Paid 44 x 17.50 = 770. Shortfall 35. Each day spans exactly 10 h, which does not exceed 10, so no spread-of-hours pay.",
  },
  {
    id: "ho-ny-tips-below-minimum",
    group: "heldout",
    title: "NYC food server whose tips did not reach the minimum wage",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "food_service",
      scheduleText: "Mon Oct 19 5pm-11pm\nTue Oct 20 5pm-11pm\nWed Oct 21 5pm-11pm\nThu Oct 22 5pm-11pm\nFri Oct 23 5pm-11pm",
      payslipText: "Pay period 2026-10-19 to 2026-10-25\nHourly rate: $11.35\nHours paid: 30\nGross wages: $340.50\nTips reported: $100.00",
    },
    expected: { shifts: 5, workedHours: 30, expectedTotal: 410, paidTotal: 340.5, shortfall: 69.5, minWageUsed: 17, ruleKeys: ["ny.tip_credit"] },
    why: "30 h. NYC food service cash wage $11.35 with $5.65 tip credit (12 NYCRR 146-1.3). Cash wages 30 x 11.35 = 340.50. Minimum for the hours: 30 x 17.00 = 510. Cash plus tips = 440.50, so the employer must make up 69.50. Expected 340.50 + 69.50 = 410.00. Paid 340.50. Shortfall 69.50.",
  },
];
