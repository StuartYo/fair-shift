// Why a real-world check disagreed with the court, or why a post was misread.
// Written by hand AFTER each run, keyed by the result file stem
// (eval/results/realworld-<time>) and the case id. The expected values are
// frozen in the case files; this file only explains the results.
//
// Categories:
//  - fair_shift_bug: Fair Shift did something wrong on the facts as entered.
//  - fair_shift_scope: the input needs something Fair Shift says it does not cover.
//  - court_claim_limited: the court only priced what the worker claimed.
//  - court_method: the court's formula differs from the statute as Fair Shift reads it.
//  - legal_reading: two defensible readings of the same rule.
//  - court_error: an arithmetic or table error in the judgment.
//  - court_rounding: rounded multipliers or per-row rounding.
//  - facts_reconstructed: my reconstruction of dates or times drives the difference.

export type DiagnosisCategory =
  | "fair_shift_bug"
  | "fair_shift_scope"
  | "court_claim_limited"
  | "court_method"
  | "legal_reading"
  | "court_error"
  | "court_rounding"
  | "facts_reconstructed";

export interface Diagnosis {
  category: DiagnosisCategory;
  note: string;
}

const FIRST_RUN = "realworld-2026-10-14T03-26-59-071Z";
const AFTER_FIXES = "realworld-2026-10-14T03-57-13-716Z";
const RERUN_DEPLOYED = "realworld-2026-10-14T07-08-33-074Z";

export const DIAGNOSIS: Record<string, Record<string, Diagnosis>> = {
  [FIRST_RUN]: {
    "tw-court-ctdv13-jun": { category: "court_rounding", note: "The court prices an overtime hour at 186 x 1.34 = 249 (half hour 125); plus one third is 248 (124). Fair Shift is NT$1 lower per hour." },
    "tw-court-ctdv13-jul": { category: "court_rounding", note: "Same 1.34 rounding as June." },
    "tw-court-ctdv13-aug": { category: "court_rounding", note: "Same 1.34 rounding as June." },
    "tw-court-ctdv13-restdays": {
      category: "legal_reading",
      note: "Fair Shift pays rest day hours at 1 1/3 and 1 2/3 of the hourly rate in total; the court added 1.34 and 1.67 on top of the hourly pay already paid. The gap, NT$4,296, is the base pay for the 23 rest day hours plus the court's rounding. The regular day off (NT$1,488) matches.",
    },
    "tw-court-pcdv77-jan": {
      category: "court_claim_limited",
      note: "Fair Shift adds what the worker did not claim: 2024-01-01 is a national holiday, and weeks of 6 or 7 workdays pass 40 hours (LSA Enforcement Rules Art. 20-1). The court priced daily overtime only; its table also charges overtime on 1/13, a day it marks off.",
    },
    "tw-court-pcdv77-feb": { category: "fair_shift_bug", note: "Hours were rounded to 0.01 before multiplying (50 minutes became 0.83 h): NT$2 under the exact 10,431. The court's per-row rounding gives 10,432. Fixed in 2cc3b7c." },
    "tw-court-ksdv12": { category: "fair_shift_scope", note: "No rate was agreed. Fair Shift stops and asks for the hourly rate instead of assuming one; the court applied the 2023 minimum wage (LSA Art. 21)." },
    "tw-court-pcdv14-may": {
      category: "fair_shift_bug",
      note: "The 2024 minimum wage (NT$183) was not found, so the hourly equivalent of the daily wage (163) was used with no top-up. The missing rule was listed only in the problem list, with no warning next to the number. Fixed in 2cc3b7c.",
    },
    "tw-court-pcdv14-jul": { category: "fair_shift_bug", note: "Same as May: 2024 minimum wage not found. Fixed in 2cc3b7c." },
    "tw-court-pcdv14-aug": { category: "fair_shift_bug", note: "Same as May: 2024 minimum wage not found. Fixed in 2cc3b7c." },
    "tw-court-ptdv21-2022": { category: "court_error", note: "The court's rows add up to 39 hours (NT$6,552); it wrote 40 hours (NT$6,720). Fair Shift matches the rows." },
    "tw-court-tcdv24-2023": { category: "fair_shift_bug", note: "2023-09-28 was paid as Teachers' Day, which became a day off only with the 2025 amendment. Fixed in 2cc3b7c." },
    "ny-court-24-4349-apr2024": {
      category: "fair_shift_bug",
      note: "Exact for the wrong reason: the 2024 minimum wage was not found, so the spread-of-hours pay (one hour at the minimum wage on 6 days, which the worker abandoned in court) was left out as well. Fixed in 2cc3b7c.",
    },
    "ny-court-25-1177-nov2024": {
      category: "fair_shift_bug",
      note: "The 2024 minimum wage was not found, so no spread-of-hours pay ($96), and 14 h 20 min rounded to 14.33 h made the overtime $0.48 low. Fixed in 2cc3b7c.",
    },
    "ny-court-25-1177-jan2025": {
      category: "fair_shift_bug",
      note: "The 2025 minimum wage ($16.50) was not found: no top-up from $16, overtime on $16, no spread-of-hours pay. Fixed in 2cc3b7c.",
    },
    "ny-court-25-2674-2024": { category: "fair_shift_bug", note: "Exact for the wrong reason, as in 1:24-cv-04349 April: no minimum wage, so no spread-of-hours pay. Fixed in 2cc3b7c." },
    "ny-court-24-8391-2024": {
      category: "court_method",
      note: "The court set the regular rate at $650 / 40 but paid only the half-time difference on the 23 overtime hours ($186.88); Fair Shift pays them at 1.5 x $16.25 ($560.63). In this run the spread-of-hours pay was also missing (no 2024 minimum wage).",
    },
    "post-q-tutor-holiday": { category: "fair_shift_scope", note: "4/4 with '9 hours' and no clock times: Fair Shift needs a start and end time, read no shift and said so. The model alone listed 4/4, 9 hours." },
    "post-ad-weekday-range": {
      category: "fair_shift_bug",
      note: "Nano expanded 10/14-10/30 but ignored (不六日) and added the four weekend days; the rule-based parser could not read the range, so the result was marked low confidence with the line listed. Not fixed.",
    },
    "post-ad-duration-only": { category: "fair_shift_scope", note: "A date and '5 hours' with no clock times: no shift read, and the page says so." },
  },
  [AFTER_FIXES]: {
    "tw-court-ctdv13-jun": { category: "court_rounding", note: "1.34 instead of 4/3: NT$1 per overtime hour." },
    "tw-court-ctdv13-jul": { category: "court_rounding", note: "1.34 instead of 4/3." },
    "tw-court-ctdv13-aug": { category: "court_rounding", note: "1.34 instead of 4/3." },
    "tw-court-ctdv13-restdays": {
      category: "legal_reading",
      note: "Unchanged: Fair Shift uses 1 1/3 and 1 2/3 as the total rest day rate for an hourly worker; the court added them on top of the hourly pay already paid (NT$4,296 = 23 rest day hours of base pay plus rounding).",
    },
    "tw-court-pcdv77-jan": { category: "court_claim_limited", note: "Unchanged: holiday on 2024-01-01 and weekly overtime past 40 hours, which the worker did not claim; NT$9 more than the first run because hours are now exact to the minute." },
    "tw-court-pcdv77-feb": { category: "court_rounding", note: "Now the exact 10,431; the court's table rounds each row." },
    "tw-court-ksdv12": { category: "fair_shift_scope", note: "Unchanged: no agreed rate, so Fair Shift asks instead of assuming the minimum wage." },
    "tw-court-ptdv21-2022": { category: "court_error", note: "Unchanged: the court's rows add up to 39 hours, it wrote 40." },
    "tw-court-tcdv24-2023": { category: "court_rounding", note: "2023-09-28 is now a normal day: 176 x 4/3 = 234.67 vs the court's 176 x 1.34 = 236." },
    "ny-court-24-4349-apr2024": {
      category: "court_claim_limited",
      note: "Now adds one hour at the $16 minimum wage on each of the 6 days over 10 hours (12 NYCRR 146-1.6, restaurant workers whatever their rate); the worker abandoned that claim.",
    },
    "ny-court-25-3219-2024": {
      category: "legal_reading",
      note: "New difference, now that the minimum wage is found. Fair Shift owes spread-of-hours pay on the three 12-hour days only to the extent pay is below the minimum wage for the hours plus one hour (12 NYCRR 142-2.4 'in addition to the minimum wage required'): 3 x (16 x 13 - 17 x 12) = $12. The court denies spread pay outright for any period paid above the minimum wage. In the first run this case matched only because the minimum wage was missing.",
    },
    "ny-court-25-3219-2025": { category: "legal_reading", note: "Same reading as 2024, with the $16.50 minimum: 3 x (16.50 x 13 - 17 x 12) = $31.50." },
    "ny-court-25-2674-2024": { category: "court_claim_limited", note: "Spread-of-hours pay on 6 days of 11 hours (my split of 66 hours), which the worker abandoned: +$96." },
    "ny-court-24-8391-2024": {
      category: "court_method",
      note: "The court paid only the half-time difference on overtime hours it treated as unpaid by dividing by 40 ($186.88); Fair Shift pays 1.5 x $16.25 on them ($560.63) plus the same $96 spread-of-hours pay the court awarded.",
    },
    "post-q-tutor-holiday": { category: "fair_shift_scope", note: "Unchanged: a date with a length but no clock times; no shift read, and the page says so." },
    "post-ad-weekday-range": { category: "fair_shift_bug", note: "Unchanged (not fixed): (不六日) ignored, four weekend days added; marked low confidence with the line listed." },
    "post-ad-duration-only": { category: "fair_shift_scope", note: "Unchanged: a date and '5 hours' with no clock times." },
  },
  // Rerun on the deployed code (a4386f6: 2cc3b7c's fixes, 8d08beb's weekday dating, b9d3a04's message change).
  // Same reasons as the run after fixes, except one New York check where the model misread the schedule.
  [RERUN_DEPLOYED]: {
    "tw-court-ctdv13-jun": { category: "court_rounding", note: "1.34 instead of 4/3: NT$1 per overtime hour." },
    "tw-court-ctdv13-jul": { category: "court_rounding", note: "1.34 instead of 4/3." },
    "tw-court-ctdv13-aug": { category: "court_rounding", note: "1.34 instead of 4/3." },
    "tw-court-ctdv13-restdays": {
      category: "legal_reading",
      note: "Unchanged: Fair Shift uses 1 1/3 and 1 2/3 as the total rest day rate for an hourly worker; the court added them on top of the hourly pay already paid (NT$4,296 = 23 rest day hours of base pay plus rounding).",
    },
    "tw-court-pcdv77-jan": { category: "court_claim_limited", note: "Unchanged: holiday on 2024-01-01 and weekly overtime past 40 hours, which the worker did not claim; NT$9 more than the first run because hours are now exact to the minute." },
    "tw-court-pcdv77-feb": { category: "court_rounding", note: "Now the exact 10,431; the court's table rounds each row." },
    "tw-court-ksdv12": { category: "fair_shift_scope", note: "Unchanged: no agreed rate, so Fair Shift asks instead of assuming the minimum wage." },
    "tw-court-ptdv21-2022": { category: "court_error", note: "Unchanged: the court's rows add up to 39 hours, it wrote 40." },
    "tw-court-tcdv24-2023": { category: "court_rounding", note: "2023-09-28 is now a normal day: 176 x 4/3 = 234.67 vs the court's 176 x 1.34 = 236." },
    "ny-court-24-4349-apr2024": {
      category: "court_claim_limited",
      note: "Now adds one hour at the $16 minimum wage on each of the 6 days over 10 hours (12 NYCRR 146-1.6, restaurant workers whatever their rate); the worker abandoned that claim.",
    },
    "ny-court-25-3219-2024": {
      category: "legal_reading",
      note: "New difference, now that the minimum wage is found. Fair Shift owes spread-of-hours pay on the three 12-hour days only to the extent pay is below the minimum wage for the hours plus one hour (12 NYCRR 142-2.4 'in addition to the minimum wage required'): 3 x (16 x 13 - 17 x 12) = $12. The court denies spread pay outright for any period paid above the minimum wage. In the first run this case matched only because the minimum wage was missing.",
    },
    "ny-court-25-3219-2025": { category: "legal_reading", note: "Same reading as 2024, with the $16.50 minimum: 3 x (16.50 x 13 - 17 x 12) = $31.50." },
    "ny-court-25-2674-2024": { category: "court_claim_limited", note: "Spread-of-hours pay on 6 days of 11 hours (my split of 66 hours), which the worker abandoned: +$96." },
    "ny-court-25-1177-jan2025": {
      category: "fair_shift_bug",
      note: "Nemotron Nano read a seventh 14 h 20 min shift that is not in the schedule (100.33 h instead of 86). The rule-based cross-check disagreed, so the page marked the reading low confidence and warned that the payslip's 86 hours do not match the hours read; the amount is wrong but flagged. The run after fixes read the same input right and matched exactly. Not fixed: the model's reading varies between runs, and these warnings are the safeguard.",
    },
    "ny-court-24-8391-2024": {
      category: "court_method",
      note: "The court paid only the half-time difference on overtime hours it treated as unpaid by dividing by 40 ($186.88); Fair Shift pays 1.5 x $16.25 on them ($560.63) plus the same $96 spread-of-hours pay the court awarded.",
    },
    "post-q-tutor-holiday": { category: "fair_shift_scope", note: "Unchanged: a date with a length but no clock times; no shift read, and the page says so." },
    "post-ad-weekday-range": { category: "fair_shift_bug", note: "Unchanged (not fixed): (不六日) ignored, four weekend days added; marked low confidence with the line listed." },
    "post-ad-duration-only": { category: "fair_shift_scope", note: "Unchanged: a date and '5 hours' with no clock times." },
  }
};
