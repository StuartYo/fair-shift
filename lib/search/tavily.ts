import { allowedDomains, isAllowedUrl, narrowDomains } from "../domains";
import type { RetrievedDoc } from "../types";
import type { SearchHit, SearchProvider } from "./provider";

// Tavily REST API (checked 2026-10-13):
//   POST https://api.tavily.com/search   https://docs.tavily.com/documentation/api-reference/endpoint/search
//   POST https://api.tavily.com/extract  https://docs.tavily.com/documentation/api-reference/endpoint/extract
// include_domains defaults to "restrict" mode, so results stay on the allowlist.
// Every returned URL is still re-checked in code, and extract refuses
// non-allowlisted URLs before any request is made.

const API = "https://api.tavily.com";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class TavilyProvider implements SearchProvider {
  readonly kind = "tavily" as const;
  private cache = new Map<string, { at: number; doc: RetrievedDoc }>();

  constructor(
    private key = process.env.TAVILY_API_KEY,
    private domains: readonly string[] = allowedDomains(),
    private fetchImpl: FetchLike = (i, init) => fetch(i, init),
  ) {
    if (!key) throw new Error("TAVILY_API_KEY is not set");
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    // Error text never includes the request headers.
    if (!res.ok) throw new Error(`Tavily ${path} failed: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async search(query: string, domains?: readonly string[]) {
    const include = narrowDomains(domains, this.domains);
    const data = await this.post<{ results?: { url: string; title: string; content: string }[] }>("/search", {
      query,
      search_depth: "basic", // 1 credit
      max_results: 5,
      include_domains: include,
      include_answer: false,
      include_raw_content: false,
    });
    const hits: SearchHit[] = (data.results || [])
      .filter((r) => isAllowedUrl(r.url, include))
      .map((r) => ({ url: r.url, title: r.title, snippet: r.content || "" }));
    return { hits, credits: 1 };
  }

  async extract(url: string, query?: string) {
    if (!isAllowedUrl(url, this.domains)) throw new Error("URL is not on the official domain allowlist");
    const key = url + "|" + (query || "");
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return { doc: cached.doc, credits: 0 };
    const body: Record<string, unknown> = { urls: [url], extract_depth: "basic", format: "text" };
    if (query) {
      body.query = query; // reranks chunks by relevance
      body.chunks_per_source = 5;
    }
    const data = await this.post<{ results?: { url: string; raw_content: string; title?: string }[] }>("/extract", body);
    const r = data.results?.[0];
    // basic extract costs 1 credit per 5 successful URLs
    if (!r || !r.raw_content || !isAllowedUrl(r.url || url, this.domains)) return { doc: null, credits: 0.2 };
    const doc: RetrievedDoc = {
      url: r.url || url,
      title: r.title || url,
      content: r.raw_content.slice(0, 60_000),
      via: "tavily_extract",
      retrievedAt: new Date().toISOString(),
    };
    this.cache.set(key, { at: Date.now(), doc });
    return { doc, credits: 0.2 };
  }
}
