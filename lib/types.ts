// Domain-independent types shared by the agent core.

/** A document retrieved during one run (from Tavily, or from recorded fixtures in mock mode). */
export interface RetrievedDoc {
  url: string;
  title: string;
  content: string;
  via: "tavily_search" | "tavily_extract" | "fixture_search" | "fixture_extract";
  retrievedAt: string;
}

/** A quote that has been checked against retrieved text. */
export interface Citation {
  url: string;
  title: string;
  quote: string;
  verified: boolean;
  via: RetrievedDoc["via"];
}

export interface TraceStep {
  t: number; // ms since run start
  kind: "model" | "tool" | "guard" | "info";
  name: string;
  detail: string;
  model?: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  estCostUsd: number;
  tavilyCredits: number;
  modelCalls: number;
  toolCalls: number;
}

export function emptyUsage(): Usage {
  return { promptTokens: 0, completionTokens: 0, estCostUsd: 0, tavilyCredits: 0, modelCalls: 0, toolCalls: 0 };
}
