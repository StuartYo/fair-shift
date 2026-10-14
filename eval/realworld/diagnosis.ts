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

export const DIAGNOSIS: Record<string, Record<string, Diagnosis>> = {};
