import type { CourtCheck, NotUsed } from "./types";

// New York wage decisions with damages the court computed itself, from the
// Eastern District of New York, published on govinfo.gov (USCOURTS collection,
// searched 2026-10-14). Default judgments in wage cases: the court presumes the
// worker's account of hours is accurate and computes the damages week by week.
// Captions name the workers, so cases are cited by docket number only.
//
// Each check is one representative week from a period the court priced at a
// flat weekly rate (court total for the period / number of weeks), using only
// the components Fair Shift checks: minimum wage, overtime, spread of hours.
// Liquidated damages, wage notice and statement penalties, interest and fees
// are excluded. Most are reports and recommendations by a magistrate judge.
//
// Fair Shift needs an hourly rate. For a flat weekly salary I typed the regular
// rate the court itself used (weekly pay / 40, 12 NYCRR 146-3.5(b) for
// hospitality workers) in the hourly rate box, and say so per case.

const gi = (pkg: string, granule: string) => `https://www.govinfo.gov/content/pkg/${pkg}/pdf/${granule}.pdf`;

const EDNY_24_4349 = {
  caseNo: "E.D.N.Y. No. 1:24-cv-04349 (report and recommendation)",
  court: "U.S. District Court, Eastern District of New York",
  date: "2026-03-02",
  url: gi("USCOURTS-nyed-1_24-cv-04349", "USCOURTS-nyed-1_24-cv-04349-0"),
  note: "Recommendation to the district judge.",
};
const EDNY_25_1177 = {
  caseNo: "E.D.N.Y. No. 1:25-cv-01177 (report and recommendation)",
  court: "U.S. District Court, Eastern District of New York",
  date: "2026-08-07",
  url: gi("USCOURTS-nyed-1_25-cv-01177", "USCOURTS-nyed-1_25-cv-01177-0"),
  note: "Recommendation to the district judge.",
};
const EDNY_25_3219 = {
  caseNo: "E.D.N.Y. No. 1:25-cv-03219 (report and recommendation)",
  court: "U.S. District Court, Eastern District of New York",
  date: "2026-06-05",
  url: gi("USCOURTS-nyed-1_25-cv-03219", "USCOURTS-nyed-1_25-cv-03219-0"),
  note: "Recommendation to the district judge.",
};
const EDNY_25_2674 = {
  caseNo: "E.D.N.Y. No. 1:25-cv-02674 (memorandum and order)",
  court: "U.S. District Court, Eastern District of New York",
  date: "2026-05-12",
  url: gi("USCOURTS-nyed-1_25-cv-02674", "USCOURTS-nyed-1_25-cv-02674-0"),
};
const EDNY_24_8391 = {
  caseNo: "E.D.N.Y. No. 1:24-cv-08391 (report and recommendation)",
  court: "U.S. District Court, Eastern District of New York",
  date: "2025-08-26",
  url: gi("USCOURTS-nyed-1_24-cv-08391", "USCOURTS-nyed-1_24-cv-08391-0"),
  note: "Recommendation to the district judge.",
};

const week = (days: string[], start: string, end: string) => days.map((d) => `${d} ${start}-${end}`).join("\n");

export const NY_COURT_CHECKS: CourtCheck[] = [
  {
    id: "ny-court-24-4349-feb2024",
    title: "Brooklyn deli cook, $800 flat a week, 57-hour week in February 2024",
    source: EDNY_24_4349,
    facts:
      "Cook and stockroom worker at a Brooklyn deli, found to be a hospitality employee. From 2024-01-01 to 2024-03-18 he worked 6 days and 57 hours a week for a flat $800. The court presumed the salary covers 40 hours: regular rate $20, overtime rate $30, owed $30 x 17 hours = $510 a week ($5,610 for 11 weeks).",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "hospitality",
      scheduleText: week(["2024-02-05", "2024-02-06", "2024-02-07", "2024-02-08", "2024-02-09", "2024-02-10"], "07:00", "16:30"),
      payslipText: "Pay period 2024-02-05 to 2024-02-11\nGross pay: $800.00 (flat weekly pay, cash)",
      hourlyRate: 20,
    },
    court: {
      figure: 510,
      compare: "shortfall",
      components: "Unpaid overtime for 2024-01-01 to 2024-03-18: $30.00 x 17 hours x 11 weeks = $5,610, so $510 a week.",
      excluded: "Liquidated damages, wage notice and statement penalties, interest; other periods.",
    },
    assumptions: [
      "Six days of 9.5 hours (57 / 6), 07:00 to 16:30; the decision gives hours per week, not times.",
      "Hourly rate box $20 = $800 / 40, the regular rate the court used.",
    ],
    expectedDifferences: [],
  },
  {
    id: "ny-court-24-4349-apr2024",
    title: "Brooklyn deli cook, $800 flat a week, 69-hour week in April 2024",
    source: EDNY_24_4349,
    facts:
      "Same worker, 2024-03-19 to 2024-05-15: 6 days and 69 hours a week for $800. Owed $30 x 29 hours = $870 a week ($6,960 for 8 weeks). He pleaded spread-of-hours pay but did not argue it in the motion; the court treated that claim as abandoned.",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "hospitality",
      scheduleText: week(["2024-04-08", "2024-04-09", "2024-04-10", "2024-04-11", "2024-04-12", "2024-04-13"], "07:00", "18:30"),
      payslipText: "Pay period 2024-04-08 to 2024-04-14\nGross pay: $800.00 (flat weekly pay, cash)",
      hourlyRate: 20,
    },
    court: {
      figure: 870,
      compare: "shortfall",
      components: "Unpaid overtime for 2024-03-19 to 2024-05-15: $30.00 x 29 hours x 8 weeks = $6,960, so $870 a week.",
      excluded: "Spread of hours (abandoned), liquidated damages, penalties, interest.",
    },
    assumptions: ["Six days of 11.5 hours (69 / 6), 07:00 to 18:30.", "Hourly rate box $20 = $800 / 40."],
    expectedDifferences: [
      {
        kind: "court_claim_limited",
        note: "Days over 10 hours in a hospitality job get one extra hour at the minimum wage (12 NYCRR 146-1.6); the worker abandoned that claim. Expect Fair Shift about 6 x $16 = $96 above the court.",
      },
    ],
  },
  {
    id: "ny-court-25-1177-nov2024",
    title: "Brooklyn meat market worker, $16 an hour straight time, 86-hour week in November 2024",
    source: EDNY_25_1177,
    facts:
      "Worker at a Brooklyn meat market paid $16.00 an hour for all hours. From 2024-10-01 to 2024-12-31 he worked about 86 hours a week with 6 days over 10 hours. The court: overtime ($24.00 - $16.00) x 46 hours x 13 weeks = $4,784 and spread of hours $16.00 x 6 days x 13 weeks = $1,248 (spread pay only while he earned no more than the minimum wage). Per week $368 + $96 = $464.",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "general",
      scheduleText: week(["2024-11-04", "2024-11-05", "2024-11-06", "2024-11-07", "2024-11-08", "2024-11-09"], "07:00", "21:20"),
      payslipText: "Pay period 2024-11-04 to 2024-11-10\nHourly rate: $16.00 (same rate for every hour)\nHours paid: 86\nGross pay: $1,376.00",
    },
    court: {
      figure: 464,
      compare: "shortfall",
      components: "Table 2 overtime 10/01/2024-12/31/2024 ($4,784 / 13 weeks = $368) plus Table 3 spread of hours ($1,248 / 13 weeks = $96).",
      excluded: "Liquidated damages, penalties, interest; other periods.",
    },
    assumptions: ["Six days of 14 h 20 min (86 / 6), 07:00 to 21:20; the court gives hours per week and 6 spread days."],
    expectedDifferences: [],
  },
  {
    id: "ny-court-25-1177-jan2025",
    title: "Brooklyn meat market worker, $16 an hour straight time, 86-hour week in January 2025",
    source: EDNY_25_1177,
    facts:
      "Same worker, 2025-01-01 to 2025-01-22, when the New York City minimum wage was $16.50. The court: minimum wage $0.50 x 40 x 3 weeks = $60, overtime ($24.75 - $16.00) x 46 x 3 = $1,207.50, spread of hours $16.50 x 6 x 3 = $297. Per week $20 + $402.50 + $99 = $521.50.",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "general",
      scheduleText: week(["2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09", "2025-01-10", "2025-01-11"], "07:00", "21:20"),
      payslipText: "Pay period 2025-01-06 to 2025-01-12\nHourly rate: $16.00 (same rate for every hour)\nHours paid: 86\nGross pay: $1,376.00",
    },
    court: {
      figure: 521.5,
      compare: "shortfall",
      components: "Table 1 minimum wage ($60 / 3), Table 2 overtime ($1,207.50 / 3), Table 3 spread of hours ($297 / 3): $20 + $402.50 + $99 = $521.50 a week.",
      excluded: "Liquidated damages, penalties, interest.",
    },
    assumptions: ["Six days of 14 h 20 min, 07:00 to 21:20."],
    expectedDifferences: [],
  },
  {
    id: "ny-court-25-3219-2024",
    title: "Brooklyn deli worker, $17 an hour straight time, 66-hour week in 2024",
    source: EDNY_25_3219,
    facts:
      "General deli worker in Brooklyn paid $17.00 an hour from August 2022 to May 2025, 6:00 to 16:00 Monday, Wednesday, Saturday and 6:00 to 18:00 Tuesday, Thursday, Friday (66 hours). The court: overtime ($25.50 - $17.00) x 1,352 hours in 2024 = $11,492, so $221 a week; no spread-of-hours pay for periods when he earned more than the minimum wage.",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "general",
      scheduleText:
        "2024-03-04 06:00-16:00\n2024-03-05 06:00-18:00\n2024-03-06 06:00-16:00\n2024-03-07 06:00-18:00\n2024-03-08 06:00-18:00\n2024-03-09 06:00-16:00",
      payslipText: "Pay period 2024-03-04 to 2024-03-10\nHourly rate: $17.00 (straight time for all hours)\nHours paid: 66\nGross pay: $1,122.00",
    },
    court: {
      figure: 221,
      compare: "shortfall",
      components: "Overtime table, 1/1/2024-12/31/2024: $8.50 x 1,352 hours = $11,492, i.e. $8.50 x 26 = $221 a week.",
      excluded: "Minimum wage for 2019-2020, liquidated damages, penalties, interest.",
    },
    assumptions: ["Week of 2024-03-04 chosen; the schedule is the one the court states."],
    expectedDifferences: [],
  },
  {
    id: "ny-court-25-3219-2025",
    title: "Brooklyn deli worker, $17 an hour straight time, 66-hour week in 2025",
    source: EDNY_25_3219,
    facts: "Same worker and schedule, 2025-01-01 to 2025-05-16: overtime ($25.50 - $17.00) x 494 hours = $4,199, $221 a week. $17.00 is above the 2025 minimum wage ($16.50).",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "general",
      scheduleText:
        "2025-03-03 06:00-16:00\n2025-03-04 06:00-18:00\n2025-03-05 06:00-16:00\n2025-03-06 06:00-18:00\n2025-03-07 06:00-18:00\n2025-03-08 06:00-16:00",
      payslipText: "Pay period 2025-03-03 to 2025-03-09\nHourly rate: $17.00 (straight time for all hours)\nHours paid: 66\nGross pay: $1,122.00",
    },
    court: {
      figure: 221,
      compare: "shortfall",
      components: "Overtime table, 1/1/2025-5/16/2025: $8.50 x 494 hours = $4,199, i.e. $221 a week.",
      excluded: "Liquidated damages, penalties, interest.",
    },
    assumptions: ["Week of 2025-03-03 chosen."],
    expectedDifferences: [],
  },
  {
    id: "ny-court-25-2674-2024",
    title: "New York City restaurant cook, $1,000 flat a week, 66-hour week in late 2024",
    source: EDNY_25_2674,
    facts:
      "Cook and food preparer at a bar and restaurant, paid a fixed $1,000 a week from 2024-07-01 to 2024-12-31 for about 66 hours. The court: regular rate $25 ($1,000 / 40), overtime $37.50 x 26 hours = $975 a week ($25,628.57 for 26 weeks and 2 days). Her spread-of-hours claim was not raised in the motion and was treated as abandoned.",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "hospitality",
      scheduleText: week(["2024-09-09", "2024-09-10", "2024-09-11", "2024-09-12", "2024-09-13", "2024-09-14"], "12:00", "23:00"),
      payslipText: "Pay period 2024-09-09 to 2024-09-15\nGross pay: $1,000.00 (fixed weekly salary)",
      hourlyRate: 25,
    },
    court: {
      figure: 975,
      compare: "shortfall",
      components: "Unpaid overtime 2024-07-01 to 2024-12-31: $37.50 x 26 hours per week = $975 a week.",
      excluded: "Spread of hours (abandoned), liquidated damages, fees, costs; the 2023 period.",
    },
    assumptions: [
      "The decision gives 66 hours a week but not the days; I entered 6 days of 11 hours, 12:00 to 23:00.",
      "Hourly rate box $25 = $1,000 / 40, the court's regular rate.",
    ],
    expectedDifferences: [
      {
        kind: "court_claim_limited",
        note: "Spread-of-hours claim abandoned. With 6 days over 10 hours (my assumption), expect Fair Shift about $96 above the court.",
      },
      { kind: "facts_reconstructed", note: "The number of days over 10 hours depends on my 6 x 11 hour split." },
    ],
  },
  {
    id: "ny-court-24-8391-2024",
    title: "New York City deli and grocery cook, $650 flat a week, 63-hour week in 2024",
    source: EDNY_24_8391,
    facts:
      "Organizer, food preparer, cook and cleaner, treated by the court as a restaurant (hospitality) worker, 6:30 to 17:00 six days a week (63 hours), paid a flat $650 a week from 2024-01-01 to 2024-11-30. The court set the regular rate at $650 / 40 = $16.25 and the overtime rate at $24.375, but priced overtime as the difference between the two times the overtime hours (it treats the weekly pay as already paying the regular rate for every hour): ($24.375 - $16.25) x 23 = $186.88 a week. Spread of hours: one hour at the $16.00 minimum wage on each of 6 days, $96 a week.",
    input: {
      jurisdiction: "US-NY",
      nyRegion: "nyc",
      nyJob: "hospitality",
      scheduleText: week(["2024-06-03", "2024-06-04", "2024-06-05", "2024-06-06", "2024-06-07", "2024-06-08"], "06:30", "17:00"),
      payslipText: "Pay period 2024-06-03 to 2024-06-09\nGross pay: $650.00 (flat weekly pay)",
      hourlyRate: 16.25,
    },
    court: {
      figure: 282.88,
      compare: "shortfall",
      components:
        "Per week in 2024 from the court's stated formula: overtime ($24.375 - $16.25) x 23 = $186.875 plus spread of hours $16 x 6 = $96, total $282.88. The decision's damages tables are images in the published file; the per-week figure follows the formula and rates in its text.",
      excluded: "Liquidated damages, wage notice and statement penalties, interest; the 2018-2023 period.",
    },
    assumptions: ["Week of 2024-06-03 chosen; the schedule is the one the court states.", "Hourly rate box $16.25 = $650 / 40, the court's regular rate."],
    expectedDifferences: [
      {
        kind: "court_method",
        note: "Having set the regular rate at weekly pay / 40, the court paid only the half-time difference on the 23 overtime hours. Under the 40-hour presumption the overtime hours were unpaid, so 1.5 x $16.25 x 23 = $560.63 would be owed. Expect Fair Shift about $374 above the court.",
      },
    ],
  },
];

/** New York decisions opened and not used. */
export const NY_NOT_USED: NotUsed[] = [
  { caseNo: "E.D.N.Y. No. 1:25-cv-00764", court: "E.D.N.Y.", date: "2025-12-19", url: gi("USCOURTS-nyed-1_25-cv-00764", "USCOURTS-nyed-1_25-cv-00764-0"), reason: "Ruling on a motion; no damages computed." },
  { caseNo: "E.D.N.Y. No. 1:25-cv-02902", court: "E.D.N.Y.", date: "2026-02-26", url: gi("USCOURTS-nyed-1_25-cv-02902", "USCOURTS-nyed-1_25-cv-02902-0"), reason: "Collective action certification; no damages computed." },
  { caseNo: "E.D.N.Y. No. 1:25-cv-01254", court: "E.D.N.Y.", date: "2026-05-26", url: gi("USCOURTS-nyed-1_25-cv-01254", "USCOURTS-nyed-1_25-cv-01254-0"), reason: "Confirms an arbitration award as one total." },
  { caseNo: "E.D.N.Y. No. 1:24-cv-07457", court: "E.D.N.Y.", date: "2026-07-27", url: gi("USCOURTS-nyed-1_24-cv-07457", "USCOURTS-nyed-1_24-cv-07457-0"), reason: "Joint employer questions; no weekly computation usable." },
  { caseNo: "E.D.N.Y. No. 1:24-cv-04570", court: "E.D.N.Y.", date: "2025-08-24", url: gi("USCOURTS-nyed-1_24-cv-04570", "USCOURTS-nyed-1_24-cv-04570-0"), reason: "Weekly hours for 2024 not stated in the text (eight pay stubs with 53 to 76 hours)." },
];
