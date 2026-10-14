import { redact } from "./wage/redact";

// Tester feedback fields. See app/api/feedback/route.ts.

export const FEEDBACK_PREFIX = "[fair-shift-feedback]";
const MAX_COMMENT = 300;

export interface FeedbackEntry {
  answer: "yes" | "no" | "unsure";
  comment?: string;
  lang: "zh" | "en";
  version: string;
}

/** Keep only the allowed fields; anything else in the body is dropped. */
export function cleanFeedback(b: unknown): FeedbackEntry | string {
  if (!b || typeof b !== "object") return "Invalid request.";
  const o = b as Record<string, unknown>;
  if (o.answer !== "yes" && o.answer !== "no" && o.answer !== "unsure") return "answer must be yes, no or unsure.";
  const lang = o.lang === "zh" ? "zh" : "en";
  const version = typeof o.version === "string" ? o.version.replace(/[^\w.\-]/g, "").slice(0, 20) : "unknown";
  let comment: string | undefined;
  if (typeof o.comment === "string" && o.comment.trim()) {
    if (o.comment.length > MAX_COMMENT) return `Comment is limited to ${MAX_COMMENT} characters.`;
    comment = redact(o.comment.replace(/\s+/g, " ").trim()).text.slice(0, MAX_COMMENT);
  }
  return { answer: o.answer, ...(comment ? { comment } : {}), lang, version };
}
