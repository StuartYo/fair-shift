import type { EvalCase } from "./cases";

// REAL-STYLE cases. SYNTHETIC data, no real person or employer, but typed the
// way the round-2 reviewer (a labor-rights caseworker) pasted real inputs that
// the app got wrong or silently failed on:
//  - a LINE message with the date range in a header line and weekdays per line,
//    a bare weekday (六), 中午 / 晚上 times;
//  - a monthly-salary payslip (the right answer is to ask for an hourly rate);
//  - 實領 (net pay) as the only paid amount, on one line;
//  - a payslip with both 應發 (gross) and 實發 (net after insurance deductions);
//  - a New York tipped payslip on one line whose gross pay includes tips.
// Written and committed with their expected values before the code that
// handles them (commit "Add real-style eval cases with frozen expected values").
// Truth values are hand arithmetic from the official rule text, as in cases.ts.

export const REALSTYLE_CASES: EvalCase[] = [
  {
    id: "rs-tw-line-header-week",
    group: "realstyle",
    title: "LINE message: date range in the header, weekdays per line, worked National Day",
    titleZh: "店長 LINE 班表：日期寫在標題、每行只寫星期，國慶日上班",
    input: {
      jurisdiction: "TW",
      scheduleText: "店長：10/5~10/11這週班表\n週三 下午5點半到10點\n週五 18-22 休1小時\n六 中午12點-晚上8點",
      payslipText: "10月薪資明細\n時薪 196\n工時 15.5\n實領 3,038",
    },
    expected: { shifts: 3, workedHours: 15.5, expectedTotal: 4606, paidTotal: 3038, shortfall: 1568, minWageUsed: 196, holidayDates: ["2026-10-10"], ruleKeys: ["tw.holiday"] },
    why: "No year anywhere, so the current year 2026. Week 10/5 (Mon) to 10/11: 週三 = 10/7, 週五 = 10/9, 六 = 10/10 (國慶日). 10/7: 17:30-22:00 = 4.5 h. 10/9: 18:00-22:00 minus 1 h = 3 h. 10/10: 12:00-20:00 = 8 h on a national holiday (no rest day given), paid double (Art. 39). 4.5 x 196 + 3 x 196 + 8 x 196 x 2 = 882 + 588 + 3136 = 4606. Paid 15.5 x 196 = 3038 (實領, no deductions listed). Shortfall 1568.",
  },
  {
    id: "rs-tw-monthly-salary",
    group: "realstyle",
    title: "Monthly salary payslip with no hourly rate: should ask, not guess",
    titleZh: "月薪制薪資單、沒有時薪：應該先問，不該亂算",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/1 9:00-18:00\n10/2 9:00-18:00\n10/10 9:00-18:00",
      payslipText: "10月薪資\n月薪 28,000\n實領 26,800",
    },
    expected: { shifts: 3, workedHours: 27, expectedTotal: 0, paidTotal: 26800, shortfall: 0, minWageUsed: 196, needsInput: "hourly_rate" },
    why: "A monthly salary (月薪) with no hourly rate. Fair Shift checks hourly pay; computing this at the minimum wage would give a meaningless 'expected pay'. The right answer is to show no amount and ask for the hourly rate. Only that is scored.",
  },
  {
    id: "rs-tw-net-pay-one-line",
    group: "realstyle",
    title: "Payslip on one line with 實領, rate below the minimum wage",
    titleZh: "薪資單只有一行、寫「實領」，時薪低於最低工資",
    input: {
      jurisdiction: "TW",
      scheduleText: "10/13(二) 17:00-22:00\n10/14(三) 17:00-22:00\n10/15(四) 17:00-21:00",
      payslipText: "時薪 190 實領 2,660",
    },
    expected: { shifts: 3, workedHours: 14, expectedTotal: 2744, paidTotal: 2660, shortfall: 84, minWageUsed: 196 },
    why: "5 + 5 + 4 = 14 h in 2026. The 2026 minimum is 196 (rate 190 is below it): 14 x 196 = 2744. Paid 實領 2660 (= 14 x 190). Shortfall 84.",
  },
  {
    id: "rs-tw-gross-and-net",
    group: "realstyle",
    title: "Payslip with gross (應發) and net after insurance (實發): paid correctly",
    titleZh: "薪資單同時有應發和扣完勞健保的實發：其實沒有少領",
    input: {
      jurisdiction: "TW",
      scheduleText: "下週(10/19-10/25)排班如下\n禮拜一 17:00-22:00\n禮拜三 17-22\n禮拜六 10點到18點 休息1小時",
      payslipText: "薪資單 115年10月下半月\n時薪 200\n工時 17\n應發工資 3,400\n勞保自付 -186\n健保自付 -95\n實發金額 3,119",
    },
    expected: { shifts: 3, workedHours: 17, expectedTotal: 3400, paidTotal: 3400, shortfall: 0, minWageUsed: 196 },
    why: "Week 10/19 (Mon) to 10/25: 禮拜一 = 10/19 5 h, 禮拜三 = 10/21 5 h, 禮拜六 = 10/24 8 h minus 1 h = 7 h. 17 h x 200 = 3400, no overtime, no holiday. Wages are compared with gross pay 應發 3400, not net pay 3119 after the worker's own insurance contributions. Shortfall 0.",
  },
  {
    id: "rs-ny-tips-in-gross",
    group: "realstyle",
    title: "NYC food server, one-line payslip whose gross pay includes tips",
    titleZh: "紐約市餐廳服務生，薪資單一行、總額含小費",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "food_service",
      nyTipsInGross: "yes",
      scheduleText: "Fri Oct 23 4pm-12am\nSat Oct 24 4pm-12am\nSun Oct 25 4pm-12am",
      payslipText: "Period 2026-10-19 to 2026-10-25 Hourly rate $10.00 Tips $200.00 Gross pay $440.00",
    },
    expected: { shifts: 3, workedHours: 24, expectedTotal: 272.4, paidTotal: 240, shortfall: 32.4, minWageUsed: 17, ruleKeys: ["ny.tip_credit"] },
    why: "3 shifts of 16:00 to midnight = 24 h, one workweek, no overtime, spread 8 h. NYC food service cash wage minimum 2026 is $11.35 (17.00 minus the $5.65 credit, 12 NYCRR 146-1.3); the stated $10.00 is below it, so 24 x 11.35 = 272.40 is owed. The worker says gross pay includes tips, so wages paid = 440.00 - 200.00 = 240.00. Cash 272.40 + tips 200 = 472.40 is above 24 x 17 = 408, so no make-up. Shortfall 32.40.",
  },
];
