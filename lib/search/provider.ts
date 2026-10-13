import type { RetrievedDoc } from "../types";

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
}

export interface SearchProvider {
  readonly kind: "tavily" | "fixture";
  /** Search restricted to the official domain allowlist (optionally narrowed further). */
  search(query: string, domains?: readonly string[]): Promise<{ hits: SearchHit[]; credits: number }>;
  /** Extract one allowlisted page. */
  extract(url: string, query?: string): Promise<{ doc: RetrievedDoc | null; credits: number }>;
}
