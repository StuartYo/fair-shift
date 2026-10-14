import type { EvalCase } from "./cases";

// ROUND-3 cases. SYNTHETIC data, no real person or employer. One case per kind
// of input an earlier version got wrong or failed on silently (found in the
// round-3 internal review, run in demo mode on typed inputs):
//  - a shift across midnight into a national holiday (the hours after 0:00 belong to the holiday);
//  - a 9-hour shift with no break written (overtime depends on the break, and the page must say so);
//  - 中間休息半小時 at the end of the line;
//  - two shifts on one line (split shift), including bare 08-12 17-21;
//  - 18時-22時;
//  - a time line that cannot be read (it must be listed and lower the confidence, not vanish);
//  - 每小時196元 and "17.00 per hour" as the hourly rate;
//  - only 實領 (net pay) with a small gap that may just be deductions;
//  - payslip hours that do not match the schedule;
//  - 7 days in a row with no regular day off (LSA Art. 36).
// Written and committed with their expected values before the code that
// handles them (commit "Add round-3 eval cases with frozen expected values").
// Truth values are hand arithmetic from the official rule text, as in cases.ts.
//
// expected.flags: the warnings the result must show, by id, and no others of
// these ids: break_unstated, net_only, hours_mismatch, seven_days, unread_lines.
// expected.shifts counts worked shifts; a shift across midnight counts once.

export const ROUND3_CASES: EvalCase[] = [
  {
    id: "r3-tw-overnight-into-holiday",
    group: "round3",
    title: "Night shift from 10/9 22:00 to 02:00, into National Day",
    titleZh: "10/9 晚上 10 點做到凌晨 2 點，跨進國慶日",
    input: {
      jurisdiction: "TW",
      restDayWeekday: 4,
      dayOffWeekday: 0,
      scheduleText: "10/7(三) 18:00-22:00\n10/9(五) 22:00-02:00 大夜",
      payslipText: "薪資單 2026/10/01 - 2026/10/15\n時薪 196\n總工時 8\n應發 1,568",
    },
    expected: { shifts: 2, workedHours: 8, expectedTotal: 1960, paidTotal: 1568, shortfall: 392, minWageUsed: 196, holidayDates: ["2026-10-10"], ruleKeys: ["tw.holiday"], flags: [] },
    why: "Rest day Thursday, day off Sunday. 10/7 (Wed) 4 h = 784. 10/9 (Fri) 22:00-24:00 = 2 h workday = 392. 10/10 (Sat, 國慶日) 00:00-02:00 = 2 h on the holiday, counted by calendar date, paid double (Art. 39) = 784. Total 1960. Paid 1568. Shortfall 392.",
  },
  {
    id: "r3-tw-no-break-stated",
    group: "round3",
    title: "9-hour shifts with no break written",
    titleZh: "九點到六點、班表沒寫休息",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/20(二) 09:00-18:00\n10/21(三) 09:00-18:00",
      payslipText: "時薪 196\n應發 3,136",
    },
    expected: { shifts: 2, workedHours: 18, expectedTotal: 3659, paidTotal: 3136, shortfall: 523, minWageUsed: 196, flags: ["break_unstated"] },
    why: "As entered, each shift is 9 h with no break: 8 x 196 + 1 x 196 x 4/3 = 1568 + 261.33 = 1829.33 per day, 3658.67 for two days, rounded 3659. Paid 3136 (= 16 h, as if a 1-hour break each day). Shortfall 523, but all of it is overtime that disappears with a 1-hour break, so the page must warn that no break was written and that the overtime depends on it.",
  },
  {
    id: "r3-tw-break-trailing-half-hour",
    group: "round3",
    title: "Break written at the end of the line: 中間休息半小時",
    titleZh: "休息寫在句尾：中間休息半小時",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/20 09:00-18:00 中間休息半小時",
      payslipText: "時薪 196 應發 1,568",
    },
    expected: { shifts: 1, workedHours: 8.5, expectedTotal: 1699, paidTotal: 1568, shortfall: 131, minWageUsed: 196, flags: [] },
    why: "9 h minus a 30-minute break = 8.5 h. 8 x 196 + 0.5 x 196 x 4/3 = 1568 + 130.67 = 1698.67, rounded 1699. Paid 1568. Shortfall 131. The break is written, so no missing-break warning.",
  },
  {
    id: "r3-tw-split-shift-one-line",
    group: "round3",
    title: "Two shifts on one line (split shift)",
    titleZh: "同一行兩段班（早上一段、晚上一段）",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/20 08:00-12:00 17:00-22:00\n10/21 08-12 17-21",
      payslipText: "時薪 196\n應發 2,352",
    },
    expected: { shifts: 4, workedHours: 17, expectedTotal: 3397, paidTotal: 2352, shortfall: 1045, minWageUsed: 196, flags: [] },
    why: "10/20: 4 h + 5 h = 9 h in the day, so 1 h beyond 8 is overtime: 8 x 196 + 1 x 196 x 4/3 = 1829.33. 10/21: 4 h + 4 h = 8 h = 1568. Total 3397.33, rounded 3397. Paid 2352. Shortfall 1045. No shift is over 6 hours, so no missing-break warning.",
  },
  {
    id: "r3-tw-shi-format",
    group: "round3",
    title: "Times written as 18時-22時",
    titleZh: "時間寫成「18時-22時」",
    input: {
      jurisdiction: "TW",
      scheduleText: "10月20日 週二 18時-22時\n10月21日 週三 18點到22點",
      payslipText: "時薪 196\n應發 784",
    },
    expected: { shifts: 2, workedHours: 8, expectedTotal: 1568, paidTotal: 784, shortfall: 784, minWageUsed: 196, flags: [] },
    why: "Two 4-hour shifts = 8 h x 196 = 1568. Paid 784. Shortfall 784.",
  },
  {
    id: "r3-tw-unreadable-time-line",
    group: "round3",
    title: "A shift with no end time (到打烊) must be listed as unread",
    titleZh: "有一班沒寫下班時間（到打烊）：要列為沒讀懂",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/20 18:00-22:00\n10/21 18:00-22:00\n10/22 晚班 6點半到打烊",
      payslipText: "時薪 196\n應發 1,568",
    },
    expected: { shifts: 2, workedHours: 8, expectedTotal: 1568, paidTotal: 1568, shortfall: 0, minWageUsed: 196, flags: ["unread_lines"] },
    why: "The 10/22 line has no end time, so it cannot be counted. The two readable shifts are 8 h x 196 = 1568, paid 1568. The right answer counts only those and says, visibly, that one line was not read.",
  },
  {
    id: "r3-tw-rate-per-hour-words",
    group: "round3",
    title: "Hourly rate written as 每小時196元",
    titleZh: "時薪寫成「每小時196元」",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/20 17:00-21:00\n10/21 17:00-21:00",
      payslipText: "10月薪資：每小時196元，本期應發 1,372",
    },
    expected: { shifts: 2, workedHours: 8, expectedTotal: 1568, paidTotal: 1372, shortfall: 196, minWageUsed: 196, flags: [] },
    why: "8 h x 196 = 1568. Paid 1372 (7 h). Shortfall 196. The rate must be read from 每小時196元 instead of asking for it.",
  },
  {
    id: "r3-ny-rate-per-hour",
    group: "round3",
    title: "New York payslip that says 17.00 per hour",
    titleZh: "紐約薪資單寫「17.00 per hour」",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "general",
      scheduleText: "Mon Oct 19 9am-1pm\nTue Oct 20 9am-1pm\nWed Oct 21 9am-1pm",
      payslipText: "Pay period 2026-10-19 to 2026-10-25. You were paid 17.00 per hour. Total pay $187.00",
    },
    expected: { shifts: 3, workedHours: 12, expectedTotal: 204, paidTotal: 187, shortfall: 17, minWageUsed: 17, flags: [] },
    why: "NYC 2026 minimum wage $17.00. 12 h x 17.00 = 204.00, no overtime, no spread. Paid 187.00 (11 h). Shortfall 17.00.",
  },
  {
    id: "r3-tw-net-only-small-gap",
    group: "round3",
    title: "Only 實領 (net pay) on the payslip, gap the size of insurance deductions",
    titleZh: "薪資單只有實領，差額跟勞健保扣款差不多",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/20 09:00-13:00\n10/21 09:00-13:00\n10/22 09:00-13:00\n10/23 09:00-13:00",
      payslipText: "時薪 196 實領 3,050",
    },
    expected: { shifts: 4, workedHours: 16, expectedTotal: 3136, paidTotal: 3050, shortfall: 86, minWageUsed: 196, flags: ["net_only"] },
    why: "16 h x 196 = 3136. Only net pay 3050 is given; 86 (2.7%) is the size of the worker's own labor and health insurance contributions, so the page must not present it as an underpayment, and the message to the employer must not claim the amount.",
  },
  {
    id: "r3-tw-hours-mismatch",
    group: "round3",
    title: "Payslip says 12 hours, the schedule shows 8",
    titleZh: "薪資單寫 12 小時，班表只有 8 小時",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/20 18:00-22:00\n10/21 18:00-22:00",
      payslipText: "時薪 196\n總工時 12 小時\n應發 2,352",
    },
    expected: { shifts: 2, workedHours: 8, expectedTotal: 1568, paidTotal: 2352, shortfall: -784, minWageUsed: 196, flags: ["hours_mismatch"] },
    why: "The schedule has 8 h x 196 = 1568; the payslip pays 12 h = 2352. No underpayment on what was pasted, but the schedule is probably incomplete, and the page must say so.",
  },
  {
    id: "r3-tw-seven-days",
    group: "round3",
    title: "Seven days in a row, no regular day off given",
    titleZh: "連續上班 7 天，沒有填例假",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/19 18:00-22:00\n10/20 18:00-22:00\n10/21 18:00-22:00\n10/22 18:00-22:00\n10/23 18:00-22:00\n10/24 18:00-22:00\n10/25 18:00-22:00",
      payslipText: "時薪 196\n應發 5,488",
    },
    expected: { shifts: 7, workedHours: 28, expectedTotal: 5488, paidTotal: 5488, shortfall: 0, minWageUsed: 196, flags: ["seven_days"] },
    why: "7 x 4 h = 28 h x 196 = 5488, paid in full. But 10/19 to 10/25 is 7 days in a row; LSA Art. 36 requires a regular day off in every 7 days, so the page must flag it even though no day off was entered.",
  },
];
