import { modelChain } from "../lib/config";
import { isAllowedUrl } from "../lib/domains";
import type { ChatProvider } from "../lib/llm/provider";
import type { SearchProvider } from "../lib/search/provider";
import { NY_REGION_LABEL } from "../lib/wage/catalog";
import type { EvalCase } from "./cases";

// Pure-model baseline: the same Nemotron model, one prompt, no tools, no
// retrieval, no code math. This is what Fair Shift has to beat.

export const BASELINE_SYSTEM = `You are a payroll expert. Work out what this hourly worker should have been paid under the law that applies on the shift dates, and how much they were underpaid. Use the current official minimum wage for the dates and all overtime, rest day and holiday premiums that apply. Reply with JSON only:
{"min_wage_used": number, "expected_total": number, "shortfall": number, "sources": [{"rule": "...", "url": "..."}]}`;

export function baselineUser(c: EvalCase): string {
  const where = c.input.jurisdiction === "TW" ? "Taiwan" : `New York State, ${NY_REGION_LABEL[c.input.nyRegion ?? "nyc"]}`;
  return `Jurisdiction: ${where}\n\nSCHEDULE:\n${c.input.scheduleText}\n\nPAYSLIP:\n${c.input.payslipText}`;
}

export interface BaselineResult {
  caseId: string;
  model: string;
  minWageUsed?: number;
  expectedTotal?: number;
  shortfall?: number;
  sources: { rule: string; url: string }[];
  costTokens: number;
  error?: string;
}

export async function runBaseline(llm: ChatProvider, c: EvalCase): Promise<BaselineResult> {
  try {
    const r = await llm.chat(
      modelChain("super"),
      [
        { role: "system", content: BASELINE_SYSTEM },
        { role: "user", content: baselineUser(c) },
      ],
      { jsonMode: true, maxTokens: 1500, temperature: 0 },
    );
    const txt = (r.message.content || "").replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    const j = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
    return {
      caseId: c.id,
      model: r.model,
      minWageUsed: Number(j.min_wage_used),
      expectedTotal: Number(j.expected_total),
      shortfall: Number(j.shortfall),
      sources: Array.isArray(j.sources) ? j.sources.slice(0, 5) : [],
      costTokens: r.promptTokens + r.completionTokens,
    };
  } catch (e) {
    return { caseId: c.id, model: "", sources: [], costTokens: 0, error: (e as Error).message.slice(0, 120) };
  }
}

export interface Score {
  amountCorrect: boolean;
  shortfallCorrect: boolean;
  minWageCorrect: boolean;
  /** Share of cited URLs that are official and, when retrievable, contain the minimum wage used. */
  sourcesVerified: number;
  sourcesGiven: number;
}

export async function scoreBaseline(c: EvalCase, b: BaselineResult, search?: SearchProvider): Promise<Score> {
  const tol = c.input.jurisdiction === "TW" ? 1 : 0.01;
  let verified = 0;
  for (const s of b.sources) {
    if (!s.url || !isAllowedUrl(s.url)) continue;
    if (!search) continue;
    try {
      const { doc } = await search.extract(s.url);
      if (doc && b.minWageUsed && doc.content.replace(/,/g, "").includes(String(b.minWageUsed))) verified++;
    } catch {
      /* unreachable URL counts as unverified */
    }
  }
  return {
    amountCorrect: b.expectedTotal !== undefined && Math.abs(b.expectedTotal - c.expected.expectedTotal) <= tol,
    shortfallCorrect: b.shortfall !== undefined && Math.abs(b.shortfall - c.expected.shortfall) <= tol,
    minWageCorrect: b.minWageUsed === c.expected.minWageUsed,
    sourcesVerified: verified,
    sourcesGiven: b.sources.length,
  };
}
