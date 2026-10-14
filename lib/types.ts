// Domain-independent types shared by the agent core.

/** A document retrieved during one run (from Tavily, or from recorded fixtures in mock mode). */
export interface RetrievedDoc {
  url: string;
  title: string;
  content: string;
  via: "tavily_search" | "tavily_extract" | "fixture_search" | "fixture_extract";
  retrievedAt: string;
  /** How the URL was found: a seed page from the catalog, or a result of a search in this run. */
  foundBy?: "seed" | "search";
}

/** A quote that has been checked against retrieved text. */
export interface Citation {
  url: string;
  title: string;
  quote: string;
  verified: boolean;
  via: RetrievedDoc["via"];
  foundBy?: RetrievedDoc["foundBy"];
}

export interface TraceStep {
  t: number; // ms since run start
  kind: "model" | "tool" | "guard" | "info";
  name: string;
  detail: string;
  /** Same detail in Traditional Chinese, for the Chinese page. */
  detailZh?: string;
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
