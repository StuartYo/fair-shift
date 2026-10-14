import type { CheckInput } from "../../lib/wage/types";

// Real-world evaluation set: court judgments with an amount the court computed
// itself, and messy schedule text people posted publicly. Expected values in
// courts-tw.ts, courts-ny.ts and posts.ts were committed before Fair Shift ran
// on any of these inputs (commit "Add real-world eval set with frozen expected
// values"). Diagnosis of the results lives in diagnosis.ts, written after the run.

/** Why Fair Shift's number may differ from the court's, written down before the run. */
export type DifferenceKind =
  | "court_rounding" // the court rounded the multipliers (1.34, 1.67) or rounded per row
  | "court_claim_limited" // the court only decided what the worker claimed (or the worker dropped a claim)
  | "court_method" // the court used a formula that differs from the statute as Fair Shift reads it
  | "legal_reading" // two defensible readings of the same rule
  | "court_error" // an arithmetic or table error in the judgment
  | "facts_reconstructed" // the judgment gives counts or totals; I placed them on dates or times
  | "fair_shift_scope"; // the input needs something Fair Shift says it does not cover

export interface CourtSource {
  /** Public case number. Taiwan: 裁判字號. United States: court and docket number. */
  caseNo: string;
  court: string;
  /** Date of the judgment or report and recommendation (YYYY-MM-DD). */
  date: string;
  url: string;
  /** For US reports and recommendations: they are recommendations to the district judge. */
  note?: string;
}

export interface CourtCheck {
  id: string;
  title: string;
  source: CourtSource;
  /** Facts as the court found them, and how I reduced them to the input below. */
  facts: string;
  input: CheckInput;
  court: {
    /** The court's amount for the components Fair Shift checks. */
    figure: number;
    /** Compare the figure with Fair Shift's shortfall (default) or with its expected total (nothing was paid). */
    compare: "shortfall" | "expectedTotal";
    /** What the figure contains and where it is in the judgment. */
    components: string;
    /** Parts of the award not compared (severance, leave pay, pension, liquidated damages, interest...). */
    excluded: string;
  };
  /** Reconstruction choices I made that the judgment does not state. */
  assumptions: string[];
  /** Differences I expected before running Fair Shift. */
  expectedDifferences: { kind: DifferenceKind; note: string }[];
}

/** A judgment read and not used, so the denominator is visible. */
export interface NotUsed {
  caseNo: string;
  court: string;
  date: string;
  url: string;
  reason: string;
}

/** One expected shift. Times may be absent when the text gives only a duration. */
export interface ExpectedShift {
  /** MM-DD (posts rarely give a year). */
  md: string;
  start?: string;
  end?: string;
  hours?: number;
}

export interface PostCase {
  id: string;
  /** question = a worker asking about pay; job_ad = an employer's ad on the part-time board. */
  kind: "question" | "job_ad";
  board: "Salary" | "part-time";
  /** Year the post was written (the year Fair Shift should assume is not scored). */
  postYear: number;
  /** Minimally paraphrased text: user names, shop names, contact details and links removed. */
  scheduleText: string;
  payslipText: string;
  /** Rate typed in the form so the run gets past the rate check; not part of the post unless noted. */
  hourlyRate: number;
  expected: { outcome: "shifts"; shifts: ExpectedShift[] } | { outcome: "ask" };
  /** Why these are the expected shifts. */
  why: string;
}
