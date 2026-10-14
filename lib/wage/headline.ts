import type { Computation, Payslip } from "./types";

/**
 * Below this share of the expected pay, a gap against take-home pay (實領) is
 * about the size of the worker's own labor and health insurance contributions,
 * so the page does not call it an underpayment.
 */
export const NET_GAP_SHARE = 0.05;

export type Headline =
  /** Gross pay compared (or US): "you may be owed X". upTo: compared with net pay, gap above the threshold. */
  | { kind: "owed"; amount: number; upTo: boolean; share: number }
  /** Only net pay, small gap: it may just be deductions. */
  | { kind: "maybe_deductions"; amount: number; share: number }
  | { kind: "no_gap" }
  | { kind: "no_paid" };

export function headlineOf(c: Computation, p: Pick<Payslip, "paidKind">): Headline {
  if (c.shortfall === undefined) return { kind: "no_paid" };
  if (c.shortfall <= 0) return { kind: "no_gap" };
  const share = c.expectedTotal > 0 ? c.shortfall / c.expectedTotal : 1;
  if (p.paidKind === "net") return share <= NET_GAP_SHARE ? { kind: "maybe_deductions", amount: c.shortfall, share } : { kind: "owed", amount: c.shortfall, upTo: true, share };
  return { kind: "owed", amount: c.shortfall, upTo: false, share };
}
