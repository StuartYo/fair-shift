import { EVAL_CASES, type EvalCase } from "./cases";
import { REALSTYLE_CASES } from "./realstyle";

// The samples offered on the page: the main and messy cases plus the real-style
// cases. Held-out cases are never shown, so they stay unseen.
export const SAMPLE_CASES: EvalCase[] = [...EVAL_CASES, ...REALSTYLE_CASES];

/** The sample whose text the input still matches exactly, if any. */
export function matchSample(
  sampleId: unknown,
  input: { jurisdiction: string; scheduleText: string; payslipText: string },
): EvalCase | undefined {
  if (typeof sampleId !== "string") return undefined;
  const c = SAMPLE_CASES.find((x) => x.id === sampleId);
  if (!c) return undefined;
  const same = c.input.jurisdiction === input.jurisdiction && c.input.scheduleText === input.scheduleText && c.input.payslipText === input.payslipText;
  return same ? c : undefined;
}
