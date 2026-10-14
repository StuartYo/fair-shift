import type { CourtCheck, NotUsed } from "./types";

// Taiwan labor judgments (司法院裁判書查詢, judgment.judicial.gov.tw) for hourly
// or daily-paid workers, where the court computed the amount owed itself.
// Public records; party names are left out. Found with the court's own full-text
// search on 2026-10-14 (29 searches, 40 judgments opened, 2 to 3 seconds apart).
//
// Every figure below is the court's, copied from the judgment's reasoning or its
// appendix table, before Fair Shift ran on any of these inputs. Each check
// compares only the parts of the award that Fair Shift computes (hourly pay,
// minimum wage, overtime, rest day, holiday and regular day off pay). Severance,
// notice pay, unused leave, pension contributions, insurance and interest are
// excluded and named per case.
//
// Schedules: judgments give hours per day, rarely clock times. Where only a
// duration is given I picked a start time (written in `assumptions`); the start
// time does not change any amount unless a shift crosses midnight, and none does.

const fjud = (id: string) => `https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=${encodeURIComponent(id)}`;

const CTDV13 = {
  caseNo: "臺灣橋頭地方法院 115 年度勞小字第 13 號民事判決",
  court: "Ciaotou District Court (Taiwan), labor small claims",
  date: "2026-07-31",
  url: fjud("CTDV,115,勞小,13,20260731,1"),
};
const PCDV77 = {
  caseNo: "臺灣新北地方法院 113 年度勞小字第 77 號民事判決",
  court: "New Taipei District Court (Taiwan), labor small claims",
  date: "2024-12-04",
  url: fjud("PCDV,113,勞小,77,20241204,1"),
};
const KSDV12 = {
  caseNo: "臺灣高雄地方法院 113 年度勞小字第 12 號民事判決",
  court: "Kaohsiung District Court (Taiwan), labor small claims",
  date: "2024-04-19",
  url: fjud("KSDV,113,勞小,12,20240419,1"),
};
const PCDV14 = {
  caseNo: "臺灣新北地方法院 114 年度勞訴字第 14 號民事判決",
  court: "New Taipei District Court (Taiwan), labor",
  date: "2025-07-25",
  url: fjud("PCDV,114,勞訴,14,20250725,1"),
};
const PTDV21 = {
  caseNo: "臺灣屏東地方法院 113 年度勞訴字第 21 號民事判決",
  court: "Pingtung District Court (Taiwan), labor",
  date: "2025-03-11",
  url: fjud("PTDV,113,勞訴,21,20250311,2"),
};
const TCDV24 = {
  caseNo: "臺灣臺中地方法院 114 年度勞小字第 24 號民事判決",
  court: "Taichung District Court (Taiwan), labor small claims",
  date: "2025-08-01",
  url: fjud("TCDV,114,勞小,24,20250801,1"),
};

const CTDV13_FACTS =
  "Store clerk paid NT$186 an hour from 2024-06-03 to the end of August 2024 (monthly pay after that, not used here). The court accepted her clock records: on the days in appendix table 1 she worked 0.5 or 1 hour beyond 8 hours, and the employer proved no break, so the whole time counts. The court priced each extra hour at 186 x 1.34 = 249 (half hour 125), which treats the extra time as unpaid.";

export const TW_COURT_CHECKS: CourtCheck[] = [
  {
    id: "tw-court-ctdv13-jun",
    title: "Store clerk, NT$186/h, June 2024 days with unpaid overtime (court table)",
    source: CTDV13,
    facts: CTDV13_FACTS + " June 2024 days: 6/6, 6/7, 6/9, 6/14, 6/22, 6/30 one hour over; 6/19, 6/28 half an hour over.",
    input: {
      jurisdiction: "TW",
      scheduleText:
        "2024/6/6 11:00-20:00\n2024/6/7 11:00-20:00\n2024/6/9 11:00-20:00\n2024/6/14 11:00-20:00\n2024/6/19 11:00-19:30\n2024/6/22 11:00-20:00\n2024/6/28 11:00-19:30\n2024/6/30 11:00-20:00",
      payslipText: "期間 2024/06/01 - 2024/06/30\n時薪 186\n這 8 天每天只算 8 小時：應發 11,904",
    },
    court: {
      figure: 1744,
      compare: "shortfall",
      components: "Overtime for the June 2024 rows of appendix table 1: 6 x 249 + 2 x 125 = 1,744 (court column 法院認定加班金額).",
      excluded: "Rest day and regular day off pay (separate check), monthly-pay months from September 2024.",
    },
    assumptions: [
      "Start time 11:00 on every day; the judgment gives hours, not clock times.",
      "Only the days in the court's table are entered. She worked other days in June; the judgment does not list their hours.",
      "Payslip reduced to the pay for these days at 8 hours each (NT$186 x 64 h), since the court treats the extra time as unpaid.",
    ],
    expectedDifferences: [{ kind: "court_rounding", note: "The court uses 1.34 for the first two overtime hours; the statute says plus one third (4/3). 249 vs 248 per hour." }],
  },
  {
    id: "tw-court-ctdv13-jul",
    title: "Store clerk, NT$186/h, July 2024 days with unpaid overtime (court table)",
    source: CTDV13,
    facts: CTDV13_FACTS + " July 2024 days: 7/20 one hour over; 7/4, 7/5, 7/7, 7/17, 7/18, 7/27 half an hour over.",
    input: {
      jurisdiction: "TW",
      scheduleText:
        "2024/7/4 11:00-19:30\n2024/7/5 11:00-19:30\n2024/7/7 11:00-19:30\n2024/7/17 11:00-19:30\n2024/7/18 11:00-19:30\n2024/7/20 11:00-20:00\n2024/7/27 11:00-19:30",
      payslipText: "期間 2024/07/01 - 2024/07/31\n時薪 186\n這 7 天每天只算 8 小時：應發 10,416",
    },
    court: {
      figure: 999,
      compare: "shortfall",
      components: "Overtime for the July 2024 rows of appendix table 1: 249 + 6 x 125 = 999.",
      excluded: "Rest day 7/16 and regular day off 7/21 (separate check).",
    },
    assumptions: [
      "Start time 11:00; only the days in the court's table are entered.",
      "Payslip reduced to the pay for these days at 8 hours each (NT$186 x 56 h).",
    ],
    expectedDifferences: [{ kind: "court_rounding", note: "1.34 instead of 4/3." }],
  },
  {
    id: "tw-court-ctdv13-aug",
    title: "Store clerk, NT$186/h, August 2024 days with unpaid overtime (court table)",
    source: CTDV13,
    facts:
      CTDV13_FACTS +
      " August 2024 days: 8/16, 8/18 one hour over; 8/1, 8/8, 8/9, 8/10, 8/11, 8/14, 8/15, 8/21, 8/22, 8/24, 8/29, 8/30, 8/31 half an hour over. The court also found 19 days in a row (8/7 to 8/25) but priced only the rows in the table and the rest days.",
    input: {
      jurisdiction: "TW",
      scheduleText:
        "2024/8/1 11:00-19:30\n2024/8/8 11:00-19:30\n2024/8/9 11:00-19:30\n2024/8/10 11:00-19:30\n2024/8/11 11:00-19:30\n2024/8/14 11:00-19:30\n2024/8/15 11:00-19:30\n2024/8/16 11:00-20:00\n2024/8/18 11:00-20:00\n2024/8/21 11:00-19:30\n2024/8/22 11:00-19:30\n2024/8/24 11:00-19:30\n2024/8/29 11:00-19:30\n2024/8/30 11:00-19:30\n2024/8/31 11:00-19:30",
      payslipText: "期間 2024/08/01 - 2024/08/31\n時薪 186\n這 15 天每天只算 8 小時：應發 22,320",
    },
    court: {
      figure: 2123,
      compare: "shortfall",
      components: "Overtime for the August 2024 rows of appendix table 1: 2 x 249 + 13 x 125 = 2,123. The three months sum to the table total 4,866.",
      excluded: "Rest days 8/13 and 8/20 and two unnamed regular days off (separate check).",
    },
    assumptions: [
      "Start time 11:00; only the days in the court's table are entered (not the other days of the 19-day run).",
      "Payslip reduced to the pay for these days at 8 hours each (NT$186 x 120 h).",
    ],
    expectedDifferences: [{ kind: "court_rounding", note: "1.34 instead of 4/3." }],
  },
  {
    id: "tw-court-ctdv13-restdays",
    title: "Store clerk, NT$186/h, three rest days and one regular day off worked in July and August 2024",
    source: CTDV13,
    facts:
      "Same worker. The court found she worked her rest days (休息日) on 2024-07-16 (12:00 to 19:00, 7 hours), 2024-08-13 and 2024-08-20 (8 hours each), and her regular day off (例假) on 2024-07-21 (8 hours), plus two more regular days off between 8/7 and 8/25 that it does not date. It awarded 186 x 1.34 x 2 + 186 x 1.67 x 5 = 2,052 for 7/16, 4,724 for 8/13 and 8/20, and 186 x 8 per regular day off.",
    input: {
      jurisdiction: "TW",
      scheduleText: "2024/7/16（休息日）12:00-19:00\n2024/7/21（例假）09:00-17:00\n2024/8/13（休息日）09:00-17:00\n2024/8/20（休息日）09:00-17:00",
      payslipText: "期間 2024/07/01 - 2024/08/31\n時薪 186\n這 4 天按原時薪發：應發 5,766",
    },
    court: {
      figure: 8264,
      compare: "shortfall",
      components: "Rest days 2,052 + 4,724 and the dated regular day off 7/21: 186 x 8 = 1,488. Total 8,264.",
      excluded: "The two undated regular days off (2 x 1,488), the overtime table, monthly-pay months.",
    },
    assumptions: [
      "Times for 7/21, 8/13 and 8/20 set to 09:00-17:00 (the court gives 8 hours).",
      "The payslip says these hours were paid at the hourly rate. The judgment does not say so directly; its award of 186 x 8 extra per regular day off (Art. 40 doubles the pay) only makes sense if the base was already paid, so I read the rest day award the same way.",
    ],
    expectedDifferences: [
      {
        kind: "legal_reading",
        note: "The court adds 1 1/3 and 1 2/3 on top of the hourly pay already paid (total 2 1/3 and 2 2/3 of the hourly rate). Fair Shift uses 1 1/3 and 1 2/3 as the total for an hourly worker, following the Ministry of Labor's statement that the hourly minimum wage already includes rest day pay. Expect Fair Shift far below the court on the rest days.",
      },
      { kind: "court_rounding", note: "1.34 and 1.67 instead of 4/3 and 5/3." },
    ],
  },
  {
    id: "tw-court-pcdv77-jan",
    title: "Restaurant worker, NT$183/h, January 2024 wages never paid (court table, 26 days)",
    source: PCDV77,
    facts:
      "Kitchen and floor worker at a teppanyaki shop, NT$183 an hour, hired 2023-12-14, last day 2024-02-08. The employer did not appear; the court accepted the worker's table of daily hours and priced each day as 183 x 8 plus overtime at 183 x 4/3 (first two extra hours) and 183 x 5/3. The table's note gives January 2024 pay as 50,530.",
    input: {
      jurisdiction: "TW",
      scheduleText: [
        "2024/1/1 11:00-20:30",
        "2024/1/2 11:00-20:30",
        "2024/1/3 11:00-20:30",
        "2024/1/4 11:00-20:30",
        "2024/1/5 11:00-20:50",
        "2024/1/6 11:00-20:50",
        "2024/1/7 11:00-20:50",
        "2024/1/10 11:00-20:30",
        "2024/1/11 11:00-20:30",
        "2024/1/12 11:00-20:30",
        "2024/1/14 11:00-20:50",
        "2024/1/15 11:00-21:30",
        "2024/1/16 11:00-21:30",
        "2024/1/17 11:00-21:30",
        "2024/1/18 11:00-21:30",
        "2024/1/20 11:00-21:50",
        "2024/1/21 11:00-21:50",
        "2024/1/22 11:00-21:30",
        "2024/1/23 11:00-21:30",
        "2024/1/24 11:00-19:30",
        "2024/1/25 11:00-21:30",
        "2024/1/26 11:00-21:50",
        "2024/1/27 11:00-21:50",
        "2024/1/28 11:00-16:50",
        "2024/1/29 11:00-21:30",
        "2024/1/30 11:00-20:30",
      ].join("\n"),
      payslipText: "期間 2024/01/01 - 2024/01/31\n時薪 183\n1 月薪水完全沒發，應發 0",
    },
    court: {
      figure: 50530,
      compare: "expectedTotal",
      components: "January 2024 pay per the appendix table: normal hours 37,515 + overtime 10,775 + 2,240 = 50,530 (the table note states 50,530).",
      excluded: "Pension contributions (3,702), the December 2023 days, February (separate check).",
    },
    assumptions: [
      "Start time 11:00; end time = start + the hours in the court's table (for example 9 h 30 min -> 20:30).",
      "Nothing was paid for January, so the court's figure is compared with Fair Shift's expected total.",
      "Days marked 休 (off) in the table are left out. The table charges 447 of overtime on 1/13, a day it marks off, and 1 h 50 min of overtime on 1/12, a day of 9 h 30 min; the hours column is entered as written.",
    ],
    expectedDifferences: [
      {
        kind: "court_claim_limited",
        note: "The worker claimed only daily overtime, and the court priced only that. 2024-01-01 is a national holiday (double pay), 1/1 to 1/7 and 1/20 to 1/30 are 7 and 11 days in a row, and several weeks pass 40 hours; none of that is in the court's figure. Expect Fair Shift well above the court.",
      },
      { kind: "court_error", note: "Table rows 1/12 and 1/13 do not match their own hours (about 81 + 447)." },
    ],
  },
  {
    id: "tw-court-pcdv77-feb",
    title: "Restaurant worker, NT$183/h, February 2024 wages never paid (5 days)",
    source: PCDV77,
    facts: "Same worker, February 2024: 2/2 9 h 50 min, 2/3 10 h 50 min, 2/6, 2/7, 2/8 10 h 30 min. The table note gives February pay as 10,432.",
    input: {
      jurisdiction: "TW",
      scheduleText: "2024/2/2 11:00-20:50\n2024/2/3 11:00-21:50\n2024/2/6 11:00-21:30\n2024/2/7 11:00-21:30\n2024/2/8 11:00-21:30",
      payslipText: "期間 2024/02/01 - 2024/02/29\n時薪 183\n2 月薪水完全沒發，應發 0",
    },
    court: {
      figure: 10432,
      compare: "expectedTotal",
      components: "February 2024 pay per the appendix table: 7,320 + 2,399 + 713 = 10,432.",
      excluded: "Pension contributions.",
    },
    assumptions: ["Start time 11:00.", "Nothing was paid, so the figure is compared with the expected total."],
    expectedDifferences: [
      {
        kind: "court_rounding",
        note: "The table prices partial overtime hours per row (for example 50 minutes at 183 x 5/3 = 254); small rounding differences possible.",
      },
    ],
  },
  {
    id: "tw-court-ksdv12",
    title: "Three days of moving help in December 2023, no agreed rate, paid NT$1,250",
    source: KSDV12,
    facts:
      "The worker and her sister helped the defendant move on 2023-12-09, 12-10 and 12-12 and were paid 2,500 together (1,250 each). No rate was agreed. The worker claimed 8, 14 and 13 hours, but told the court she actually worked about 3 hours a day and waited the rest of the time; the court found 3 hours a day and applied the 2023 hourly minimum wage: 176 x 9 = 1,584, minus 1,250 = 334.",
    input: {
      jurisdiction: "TW",
      scheduleText: "2023/12/9 09:00-12:00\n2023/12/10 09:00-12:00\n2023/12/12 09:00-12:00",
      payslipText: "三天我和妹妹共拿 2,500 元，我的一半是 1,250 元\n沒有講好時薪",
    },
    court: {
      figure: 334,
      compare: "shortfall",
      components: "Wages at the 2023 hourly minimum wage for 9 hours (1,584) minus 1,250 paid.",
      excluded: "Nothing else was awarded.",
    },
    assumptions: ["Clock times 09:00-12:00 chosen; the court found 3 hours of actual work per day without times."],
    expectedDifferences: [
      {
        kind: "fair_shift_scope",
        note: "No hourly rate is stated. Fair Shift is designed to stop and ask for the rate instead of assuming one; the court applied the minimum wage (LSA Art. 21). Expect no amount.",
      },
    ],
  },
  {
    id: "tw-court-pcdv14-may",
    title: "Daily wage NT$1,800 for 11-hour days, May 2024 with Labor Day (minimum wage check)",
    source: PCDV14,
    facts:
      "Restaurant worker paid NT$1,800 a day, working Sunday to Thursday 10:30 to 21:30 (11 hours) and Friday, Saturday to 22:00. The court held that the daily wage may not be less than the minimum hourly wage for 8 hours plus overtime pay for the rest: 183 x 8 + 183 x 4/3 x 2 + 183 x 5/3 x 1 = 2,257 per Sunday-to-Thursday day in 2024, and for 2024-05-01 (Labor Day) 183 x 8 x 2 + 183 x 4/3 x 2 + 183 x 5/3 x 1 = 3,721. May 2024: 14 Sunday-to-Thursday days plus 5/1, so 2,257 x 14 + 3,721 = 35,319, against 27,000 + 1,800 + 366 = 29,166 paid.",
    input: {
      jurisdiction: "TW",
      scheduleText: [
        "2024/5/1（三）10:30-21:30",
        "2024/5/2（四）10:30-21:30",
        "2024/5/5（日）10:30-21:30",
        "2024/5/6（一）10:30-21:30",
        "2024/5/9（四）10:30-21:30",
        "2024/5/12（日）10:30-21:30",
        "2024/5/13（一）10:30-21:30",
        "2024/5/16（四）10:30-21:30",
        "2024/5/19（日）10:30-21:30",
        "2024/5/20（一）10:30-21:30",
        "2024/5/23（四）10:30-21:30",
        "2024/5/26（日）10:30-21:30",
        "2024/5/27（一）10:30-21:30",
        "2024/5/29（三）10:30-21:30",
        "2024/5/30（四）10:30-21:30",
      ].join("\n"),
      payslipText: "期間 2024/05/01 - 2024/05/31\n日薪 1,800 元（每天 10:30-21:30，老闆說含加班）\n5 月上班 15 天\n應發 29,166（日薪 27,000 + 5/1 加發 1,800 + 加班費 366）",
      hourlyRate: 163,
    },
    court: {
      figure: 6153,
      compare: "shortfall",
      components: "May 2024 minimum pay 2,257 x 14 + 3,721 = 35,319 minus 29,166 paid (court's month-by-month arithmetic).",
      excluded: "Severance, unused leave, pension contributions, other months.",
    },
    assumptions: [
      "The court gives day counts per month, not dates. I placed the 14 Sunday-to-Thursday days on real Sundays to Thursdays of May 2024, at most four a week, so no week passes 40 regular hours; the court's arithmetic does not depend on which days.",
      "Hourly rate box: 163 = 1,800 / 11 hours, rounded down. It is below the 2024 minimum wage, so the minimum wage is used either way, as the court did.",
    ],
    expectedDifferences: [],
  },
  {
    id: "tw-court-pcdv14-jul",
    title: "Daily wage NT$1,800 for 11-hour days, July 2024 (one 9.5-hour day)",
    source: PCDV14,
    facts:
      "Same worker. July 2024: 14 Sunday-to-Thursday days of 11 hours plus 2024-07-25, when the shop opened late and she worked 9.5 hours (court: 183 x 8 + 183 x 4/3 x 1.5 = 1,830). Minimum pay 2,257 x 14 + 1,830 = 33,428 against 26,593 paid.",
    input: {
      jurisdiction: "TW",
      scheduleText: [
        "2024/7/1（一）10:30-21:30",
        "2024/7/2（二）10:30-21:30",
        "2024/7/4（四）10:30-21:30",
        "2024/7/7（日）10:30-21:30",
        "2024/7/8（一）10:30-21:30",
        "2024/7/11（四）10:30-21:30",
        "2024/7/14（日）10:30-21:30",
        "2024/7/15（一）10:30-21:30",
        "2024/7/18（四）10:30-21:30",
        "2024/7/21（日）10:30-21:30",
        "2024/7/22（一）10:30-21:30",
        "2024/7/25（四）12:00-21:30",
        "2024/7/28（日）10:30-21:30",
        "2024/7/29（一）10:30-21:30",
        "2024/7/30（二）10:30-21:30",
      ].join("\n"),
      payslipText: "期間 2024/07/01 - 2024/07/31\n日薪 1,800 元（每天 10:30-21:30，老闆說含加班）\n7 月上班 15 天\n應發 26,593",
      hourlyRate: 163,
    },
    court: {
      figure: 6835,
      compare: "shortfall",
      components: "July 2024 minimum pay 2,257 x 14 + 1,830 = 33,428 minus 26,593 paid.",
      excluded: "Severance, unused leave, pension contributions, other months.",
    },
    assumptions: [
      "Dates placed on real Sundays to Thursdays of July 2024 (the court gives counts).",
      "7/25 entered as 12:00-21:30 (the court counts 9.5 hours).",
      "Hourly rate box 163 (1,800 / 11), below the minimum wage.",
    ],
    expectedDifferences: [],
  },
  {
    id: "tw-court-pcdv14-aug",
    title: "Daily wage NT$1,800 for 11-hour days, August 2024",
    source: PCDV14,
    facts: "Same worker. August 2024: 14 Sunday-to-Thursday days of 11 hours (8/25 was scheduled but not worked). Minimum pay 2,257 x 14 = 31,598 against 27,000 paid.",
    input: {
      jurisdiction: "TW",
      scheduleText: [
        "2024/8/1（四）10:30-21:30",
        "2024/8/4（日）10:30-21:30",
        "2024/8/5（一）10:30-21:30",
        "2024/8/8（四）10:30-21:30",
        "2024/8/11（日）10:30-21:30",
        "2024/8/12（一）10:30-21:30",
        "2024/8/15（四）10:30-21:30",
        "2024/8/18（日）10:30-21:30",
        "2024/8/19（一）10:30-21:30",
        "2024/8/22（四）10:30-21:30",
        "2024/8/26（一）10:30-21:30",
        "2024/8/27（二）10:30-21:30",
        "2024/8/28（三）10:30-21:30",
        "2024/8/29（四）10:30-21:30",
      ].join("\n"),
      payslipText: "期間 2024/08/01 - 2024/08/31\n日薪 1,800 元（每天 10:30-21:30，老闆說含加班）\n8 月上班 14 天\n應發 27,000",
      hourlyRate: 163,
    },
    court: {
      figure: 4598,
      compare: "shortfall",
      components: "August 2024 minimum pay 2,257 x 14 = 31,598 minus 27,000 paid.",
      excluded: "Severance, unused leave, pension contributions, other months.",
    },
    assumptions: ["Dates placed on real Sundays to Thursdays of August 2024, skipping 8/25.", "Hourly rate box 163 (1,800 / 11)."],
    expectedDifferences: [],
  },
  {
    id: "tw-court-ptdv21-2023",
    title: "Hourly sales promoter at minimum wage, national holidays worked in 2023, paid straight time",
    source: PTDV21,
    facts:
      "Promoter in supermarkets paid the hourly minimum wage each year (NT$176 in 2023). From the clock records the court found these 2023 national holidays worked: 1/1 7 h, 1/21 (Lunar New Year's Eve) 4 h, 2/28 8 h, 4/5 (Tomb Sweeping Day) 4 h, 5/1 2 h, Dragon Boat Festival 4 h, 9/29 (Mid-Autumn) 4 h; 33 hours. Ordinary pay had been paid, so the court awarded the doubling only: 33 x 176 = 5,808.",
    input: {
      jurisdiction: "TW",
      scheduleText:
        "2023/1/1（開國紀念日）10:00-17:00\n2023/1/21（農曆除夕）10:00-14:00\n2023/2/28（和平紀念日）10:00-18:00\n2023/4/5（民族掃墓節）10:00-14:00\n2023/5/1（勞動節）10:00-12:00\n2023/6/22（端午節）10:00-14:00\n2023/9/29（中秋節）10:00-14:00",
      payslipText: "2023 年 時薪 176\n這幾天按原時薪發，沒有加倍\n應發 5,808",
    },
    court: {
      figure: 5808,
      compare: "shortfall",
      components: "Appendix table 2, year 112 (2023): 33 hours x 176 = 5,808 holiday doubling.",
      excluded: "Other years (separate check for 2022; earlier years not used), unused leave 84,496, severance, pension, insurance.",
    },
    assumptions: [
      "Start time 10:00; the court gives hours per holiday.",
      "The court's table writes the Dragon Boat Festival as 5月5日 (the lunar date); I entered the solar date 2023-06-22.",
      "Each line names the holiday the way the court's table does; the word 國定假日 is not added.",
    ],
    expectedDifferences: [
      {
        kind: "fair_shift_scope",
        note: "Lunar holidays (Lunar New Year's Eve, Tomb Sweeping Day, Dragon Boat, Mid-Autumn) are built in only for 2026 and 2027; for other years the page asks the user to mark them with 國定假日. Expect Fair Shift to miss 16 of the 33 hours unless it reads the holiday names.",
      },
    ],
  },
  {
    id: "tw-court-ptdv21-2022",
    title: "Hourly sales promoter at minimum wage, national holidays worked in 2022, paid straight time",
    source: PTDV21,
    facts:
      "Same worker, 2022 (NT$168 an hour): 1/31 (Lunar New Year's Eve) 4 h, 2/28 4 h, 4/4 (Children's Day) 4 h, 4/5 (Tomb Sweeping Day) 7 h, 5/1 8 h, 6/3 (Dragon Boat) 4 h, 9/10 (Mid-Autumn) 4 h, 10/10 4 h. These rows add up to 39 hours; the court wrote 40 hours and 40 x 168 = 6,720.",
    input: {
      jurisdiction: "TW",
      scheduleText:
        "2022/1/31（農曆除夕）10:00-14:00\n2022/2/28（和平紀念日）10:00-14:00\n2022/4/4（兒童節）10:00-14:00\n2022/4/5（民族掃墓節）10:00-17:00\n2022/5/1（勞動節）10:00-18:00\n2022/6/3（端午節）10:00-14:00\n2022/9/10（中秋節）10:00-14:00\n2022/10/10（國慶日）10:00-14:00",
      payslipText: "2022 年 時薪 168\n國定假日按原時薪發，沒有加倍\n應發 6,552",
    },
    court: {
      figure: 6720,
      compare: "shortfall",
      components: "Appendix table 2, year 111 (2022): the court's 40 hours x 168 = 6,720.",
      excluded: "Other years, unused leave, severance, pension, insurance.",
    },
    assumptions: ["Start time 10:00.", "Payslip paid = the 39 listed hours x 168 (6,552)."],
    expectedDifferences: [
      { kind: "court_error", note: "The court's rows sum to 39 hours, not 40 (168 less)." },
      { kind: "fair_shift_scope", note: "Lunar holidays before 2026 are not built in (19 of the 39 hours)." },
    ],
  },
  {
    id: "tw-court-tcdv24-2024",
    title: "Hourly shop worker sent as a mystery shopper after her shift, 2024-05-22",
    source: TCDV24,
    facts:
      "Hourly worker at the minimum wage (NT$183 in 2024). On 2024-05-22 she was sent to another branch as a mystery shopper after her shift; the court found she worked from 18:00 to about 20:20 and accepted the employer's offer to pay 2.5 hours of overtime: 183 x 4/3 x 2 + 183 x 5/3 x 0.5 = 641.",
    input: {
      jurisdiction: "TW",
      scheduleText: "2024/5/22 09:00-18:00 休1小時\n2024/5/22 18:00-20:30 被派去另一家分店當神秘客",
      payslipText: "期間 2024/05/01 - 2024/05/31\n時薪 183\n5/22 只算正常班 8 小時：應發 1,464",
    },
    court: {
      figure: 641,
      compare: "shortfall",
      components: "Overtime 641 for 2024-05-22.",
      excluded: "A 2023 minimum-hours shortfall under her contract (3,520), late-arrival deduction, other claims dismissed.",
    },
    assumptions: [
      "The judgment does not give her regular hours that day. It prices all 2.5 hours as overtime, which means 8 regular hours were already worked, so I entered a 9:00-18:00 shift with a one-hour break.",
      "18:00-20:30 entered for the 2.5 hours the court counted.",
    ],
    expectedDifferences: [{ kind: "court_rounding", note: "183 x 5/3 x 0.5 = 152.5; rounding of the half dollar may differ by 1." }],
  },
  {
    id: "tw-court-tcdv24-2023",
    title: "Hourly shop worker, one hour of overtime on 2023-09-28",
    source: TCDV24,
    facts:
      "Same worker, NT$176 an hour in 2023. The employer agreed to pay one hour of overtime on 2023-09-28, 236 (176 x 1.34). Teachers' Day (9/28) became a national day off only in 2025; in 2023 it was a normal workday.",
    input: {
      jurisdiction: "TW",
      scheduleText: "2023/9/28 09:00-19:00 休1小時",
      payslipText: "期間 2023/09/01 - 2023/09/30\n時薪 176\n9/28 只算 8 小時：應發 1,408",
    },
    court: {
      figure: 236,
      compare: "shortfall",
      components: "Overtime 236 for 2023-09-28 (one hour).",
      excluded: "Other claims.",
    },
    assumptions: ["The judgment gives one overtime hour; I entered a 9-hour day with a one-hour break (8 regular hours plus 1)."],
    expectedDifferences: [{ kind: "court_rounding", note: "1.34 instead of 4/3: 236 vs 234.67." }],
  },
];

/** Taiwan judgments opened and not used, with the reason. */
export const TW_NOT_USED: NotUsed[] = [
  { caseNo: "臺灣彰化地方法院 115 年度勞小字第 6 號", court: "Changhua", date: "2026-07-01", url: fjud("CHDV,115,勞小,6,20260701,1"), reason: "Daily-paid worker; the court accepted counts of days and overtime hours without dates." },
  { caseNo: "臺灣嘉義地方法院 115 年度勞小字第 2 號", court: "Chiayi", date: "2026-06-18", url: fjud("CYDV,115,勞小,2,20260618,1"), reason: "No employment relationship found; nothing computed." },
  { caseNo: "臺灣臺北地方法院 114 年度勞小字第 91 號", court: "Taipei", date: "2026-01-09", url: fjud("TPDV,114,勞小,91,20260109,1"), reason: "Found to be a partnership; claims dismissed." },
  { caseNo: "臺灣基隆地方法院 114 年度基勞簡字第 6 號", court: "Keelung", date: "2025-12-31", url: fjud("KLDV,114,基勞簡,6,20251231,1"), reason: "Hourly worker, but the day-by-day hours are in appendix table 2, which is not in the published text." },
  { caseNo: "臺灣臺中地方法院 114 年度勞小字第 6 號", court: "Taichung", date: "2025-02-25", url: fjud("TCDV,114,勞小,6,20250225,1"), reason: "Unpaid wages as one total; no hours or dates." },
  { caseNo: "臺灣高雄地方法院 114 年度勞小字第 3 號", court: "Kaohsiung", date: "2025-07-22", url: fjud("KSDV,114,勞小,3,20250722,1"), reason: "Monthly-paid (Fair Shift checks hourly pay)." },
  { caseNo: "臺灣臺北地方法院 113 年度勞小字第 73 號", court: "Taipei", date: "2025-03-21", url: fjud("TPDV,113,勞小,73,20250321,2"), reason: "Monthly-paid." },
  { caseNo: "臺灣臺北地方法院 113 年度勞小字第 90 號", court: "Taipei", date: "2025-01-17", url: fjud("TPDV,113,勞小,90,20250117,1"), reason: "Monthly-paid." },
  { caseNo: "臺灣高雄地方法院 113 年度勞小字第 39 號", court: "Kaohsiung", date: "2024-07-03", url: fjud("KSDV,113,勞小,39,20240703,1"), reason: "Hourly worker, but overtime and holiday pay awarded as one total with no breakdown." },
  { caseNo: "臺灣基隆地方法院 115 年度基勞簡字第 1 號", court: "Keelung", date: "2026-07-15", url: fjud("KLDV,115,基勞簡,1,20260715,1"), reason: "Monthly-paid." },
  { caseNo: "臺灣臺中地方法院 115 年度勞小字第 63 號", court: "Taichung", date: "2026-09-02", url: fjud("TCDV,115,勞小,63,20260902,1"), reason: "Claim about unscheduled hours dismissed; nothing computed." },
  { caseNo: "臺灣新北地方法院 113 年度勞小字第 133 號", court: "New Taipei", date: "2025-07-14", url: fjud("PCDV,113,勞小,133,20250714,1"), reason: "Hourly worker; straight-time total for 110.5 hours without daily hours." },
  { caseNo: "臺灣高雄地方法院 114 年度勞小字第 77 號", court: "Kaohsiung", date: "2025-11-14", url: fjud("KSDV,114,勞小,77,20251114,1"), reason: "Monthly-paid (overtime on meeting days)." },
  { caseNo: "臺灣臺北地方法院 114 年度勞簡字第 165 號", court: "Taipei", date: "2026-06-30", url: fjud("TPDV,114,勞簡,165,20260630,2"), reason: "Hourly part-timers, but unpaid wages as totals without hours." },
  { caseNo: "臺灣桃園地方法院 114 年度勞簡字第 37 號", court: "Taoyuan", date: "2025-10-21", url: fjud("TYDV,114,勞簡,37,20251021,1"), reason: "Unpaid wages as weekday counts x 8 x 190; no dates." },
  { caseNo: "臺灣高雄地方法院 113 年度勞小字第 56 號", court: "Kaohsiung", date: "2024-11-01", url: fjud("KSDV,113,勞小,56,20241101,1"), reason: "Monthly pay agreement." },
  { caseNo: "臺灣桃園地方法院 114 年度勞小字第 62 號", court: "Taoyuan", date: "2025-10-31", url: fjud("TYDV,114,勞小,62,20251031,1"), reason: "Unpaid wages as one total; no hours." },
  { caseNo: "臺灣桃園地方法院 114 年度勞小字第 80 號", court: "Taoyuan", date: "2026-01-13", url: fjud("TYDV,114,勞小,80,20260113,1"), reason: "Award is severance and related items, not hourly pay." },
  { caseNo: "臺灣橋頭地方法院 114 年度勞簡字第 25 號", court: "Ciaotou", date: "2025-08-21", url: fjud("CTDV,114,勞簡,25,20250821,1"), reason: "Unpaid month as a total, leave and severance." },
  { caseNo: "臺灣屏東地方法院 114 年度勞訴字第 8 號", court: "Pingtung", date: "2025-08-14", url: fjud("PTDV,114,勞訴,8,20250814,1"), reason: "Home care worker paid by the piece." },
  { caseNo: "臺灣臺北地方法院 115 年度勞小字第 29 號", court: "Taipei", date: "2026-04-29", url: fjud("TPDV,115,勞小,29,20260429,1"), reason: "Damages claim dismissed; no wage computation." },
  { caseNo: "臺灣臺北地方法院 115 年度勞小字第 12 號", court: "Taipei", date: "2026-09-22", url: fjud("TPDV,115,勞小,12,20260922,1"), reason: "Only interest on late severance and pension." },
  { caseNo: "臺灣臺北地方法院 114 年度勞小字第 96 號", court: "Taipei", date: "2026-02-05", url: fjud("TPDV,114,勞小,96,20260205,1"), reason: "Unpaid wages as one total." },
  { caseNo: "臺灣新北地方法院 113 年度勞小字第 64 號", court: "New Taipei", date: "2024-09-03", url: fjud("PCDV,113,勞小,64,20240903,1"), reason: "Severance only." },
  { caseNo: "臺灣基隆地方法院 113 年度基勞小字第 9 號", court: "Keelung", date: "2024-07-26", url: fjud("KLDV,113,基勞小,9,20240726,2"), reason: "One day plus 8 overtime hours in January 2024 without dates or times." },
  { caseNo: "臺灣臺中地方法院 113 年度勞訴字第 22 號", court: "Taichung", date: "2024-10-09", url: fjud("TCDV,113,勞訴,22,20241009,1"), reason: "No employment relationship found." },
  { caseNo: "臺灣臺北地方法院 113 年度勞訴字第 19 號", court: "Taipei", date: "2024-02-21", url: fjud("TPDV,113,勞訴,19,20240221,1"), reason: "Unpaid wages as totals per worker." },
  { caseNo: "臺灣桃園地方法院 114 年度勞簡上字第 11 號", court: "Taoyuan", date: "2026-05-29", url: fjud("TYDV,114,勞簡上,11,20260529,2"), reason: "Unpaid wages as totals per worker." },
  { caseNo: "臺灣新北地方法院 115 年度勞小字第 58 號", court: "New Taipei", date: "2026-05-29", url: fjud("PCDV,115,勞小,58,20260529,1"), reason: "Monthly-paid." },
  { caseNo: "臺灣桃園地方法院 114 年度勞小字第 17 號", court: "Taoyuan", date: "2025-05-13", url: fjud("TYDV,114,勞小,17,20250513,1"), reason: "Monthly-paid." },
  { caseNo: "臺灣臺北地方法院 114 年度勞簡字第 94 號", court: "Taipei", date: "2026-03-30", url: fjud("TPDV,114,勞簡,94,20260330,2"), reason: "No employment relationship found." },
  { caseNo: "臺灣桃園地方法院 114 年度勞訴字第 143 號", court: "Taoyuan", date: "2025-12-30", url: fjud("TYDV,114,勞訴,143,20251230,1"), reason: "Overtime from an agreed table based on monthly pay / 240." },
  { caseNo: "臺灣臺南地方法院 111 年度勞訴字第 95 號", court: "Tainan", date: "2024-10-17", url: fjud("TNDV,111,勞訴,95,20241017,2"), reason: "Hourly, but overtime as monthly totals for 2017 to 2022 with only some days named." },
  { caseNo: "臺灣臺北地方法院 113 年度勞小字第 13 號", court: "Taipei", date: "2024-07-15", url: fjud("TPDV,113,勞小,13,20240715,1"), reason: "Unpaid month as one total." },
];
