import { modelChain, priceForModel } from "../lib/config";
import { isAllowedUrl } from "../lib/domains";
import type { ChatProvider } from "../lib/llm/provider";
import type { SearchProvider } from "../lib/search/provider";
import { NY_JOB_LABEL, NY_REGION_LABEL } from "../lib/wage/catalog";
import type { EvalCase } from "./cases";

// Pure-model baseline: the same Nemotron model Fair Shift uses for its agent,
// one prompt, no tools, no retrieval, no code math. It gets today's date and
// the same schedule and payslip text, so the comparison is fair. This is what
// Fair Shift has to beat.

export const BASELINE_SYSTEM = `You are a payroll expert. Work out what this hourly worker should have been paid under the law that applies on the shift dates, and how much they were underpaid. Use the official minimum wage in force on the shift dates and every overtime, rest day, holiday, tip credit and spread-of-hours rule that applies. Reply with JSON only:
{"min_wage_used": number, "expected_total": number, "shortfall": number, "sources": [{"rule": "...", "url": "..."}]}`;

export function baselineUser(c: EvalCase, today: string): string {
  const where =
    c.input.jurisdiction === "TW"
      ? "Taiwan"
      : `New York State, ${NY_REGION_LABEL[c.input.nyRegion ?? "nyc"]}. Job: ${NY_JOB_LABEL[c.input.nyJob ?? "general"]}`;
  const tips = c.input.nyTipsInGross === "yes" ? "\nThe worker says the gross pay on the payslip includes tips." : "";
  return `Today's date: ${today}\nJurisdiction: ${where}${tips}\n\nSCHEDULE:\n${c.input.scheduleText}\n\nPAYSLIP:\n${c.input.payslipText}`;
}

export interface BaselineResult {
  caseId: string;
  model: string;
  minWageUsed?: number;
  expectedTotal?: number;
  shortfall?: number;
  sources: { rule: string; url: string }[];
  costTokens: number;
  costUsd: number;
  ms: number;
  error?: string;
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[^\d.-]/g, "")) : undefined);

export async function runBaseline(llm: ChatProvider, c: EvalCase, today = new Date().toISOString().slice(0, 10)): Promise<BaselineResult> {
  const t0 = Date.now();
  let lastError = "";
  let spentTokens = 0;
  let spentUsd = 0;
  // Super is a reasoning model: a small token budget can be used up before the
  // JSON answer starts, which would score as a parse error, not a wrong answer.
  // Give it a large budget and one retry so the baseline is judged on answers.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await llm.chat(
        modelChain("super"),
        [
          { role: "system", content: BASELINE_SYSTEM },
          { role: "user", content: baselineUser(c, today) },
        ],
        { jsonMode: true, maxTokens: 16000, temperature: 0 },
      );
      const [pin, pout] = priceForModel(r.model);
      spentTokens += r.promptTokens + r.completionTokens;
      spentUsd += (r.promptTokens * pin + r.completionTokens * pout) / 1_000_000;
      const txt = (r.message.content || "").replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
      const j = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
      return {
        caseId: c.id,
        model: r.model,
        minWageUsed: num(j.min_wage_used),
        expectedTotal: num(j.expected_total),
        shortfall: num(j.shortfall),
        sources: Array.isArray(j.sources) ? j.sources.slice(0, 5) : [],
        costTokens: spentTokens,
        costUsd: spentUsd,
        ms: Date.now() - t0,
      };
    } catch (e) {
      lastError = (e as Error).message.slice(0, 120);
    }
  }
  return { caseId: c.id, model: "", sources: [], costTokens: spentTokens, costUsd: spentUsd, ms: Date.now() - t0, error: lastError };
}

export interface Score {
  amountCorrect: boolean;
  shortfallCorrect: boolean;
  minWageCorrect: boolean;
  /** Cited URLs that are official, retrievable, and contain the minimum wage the model used. */
  sourcesVerified: number;
  sourcesGiven: number;
}

export async function scoreBaseline(c: EvalCase, b: BaselineResult, search?: SearchProvider): Promise<Score> {
  const tol = c.input.jurisdiction === "TW" ? 1 : 0.01;
  let verified = 0;
  for (const s of b.sources) {
    if (!s || typeof s.url !== "string" || !isAllowedUrl(s.url)) continue;
    if (!search) continue;
    try {
      const { doc } = await search.extract(s.url);
      const mw = b.minWageUsed;
      if (doc && mw !== undefined && Number.isFinite(mw)) {
        const text = doc.content.replace(/,/g, "");
        if (text.includes(String(mw)) || text.includes(mw.toFixed(2))) verified++;
      }
    } catch {
      /* unreachable URL counts as unverified */
    }
  }
  const close = (a: number | undefined, t: number) => a !== undefined && Number.isFinite(a) && Math.abs(a - t) <= tol;
  // When the right answer is to ask (a monthly salary, no hourly rate), giving no amount is right.
  const asked = !!c.expected.needsInput && !b.error && (b.expectedTotal === undefined || !Number.isFinite(b.expectedTotal));
  return {
    amountCorrect: c.expected.needsInput ? asked : close(b.expectedTotal, c.expected.expectedTotal),
    shortfallCorrect: c.expected.needsInput ? asked : close(b.shortfall, c.expected.shortfall),
    minWageCorrect: b.minWageUsed !== undefined && Math.abs(b.minWageUsed - c.expected.minWageUsed) < 0.005,
    sourcesVerified: verified,
    sourcesGiven: b.sources.length,
  };
}
