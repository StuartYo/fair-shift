import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

/**
 * Pages and search results are cached per URL (or query) per UTC day, in memory
 * and, on Vercel, in the instance's /tmp. Official wage pages change at most a
 * few times a year; repeat checks the same day reuse what was retrieved and
 * cost no credits and no wait. A new day retrieves fresh text.
 */
const today = () => new Date().toISOString().slice(0, 10);
const memory = new Map<string, unknown>();

/**
 * Optional disk cache for eval and feasibility runs (TAVILY_CACHE_DIR, gitignored).
 * Repeated runs reuse pages retrieved earlier instead of spending credits.
 * Off by default, so the deployed app always retrieves fresh text.
 */
class DiskCache {
  constructor(private dir: string) {}
  private file(kind: string, key: string) {
    return join(this.dir, `${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 24)}.json`);
  }
  get<T>(kind: string, key: string): T | undefined {
    const f = this.file(kind, key);
    if (!existsSync(f)) return undefined;
    try {
      return (JSON.parse(readFileSync(f, "utf8")) as { value: T }).value;
    } catch {
      return undefined;
    }
  }
  set(kind: string, key: string, value: unknown) {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(kind, key), JSON.stringify({ key, savedAt: new Date().toISOString(), value }, null, 1));
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class TavilyProvider implements SearchProvider {
  readonly kind = "tavily" as const;
  private disk?: DiskCache;
  private fetchImpl: FetchLike;
  private mem: Map<string, unknown>;
  /** Day-scoped disk cache in /tmp on Vercel (the eval's TAVILY_CACHE_DIR cache is not day-scoped). */
  private dayDisk?: DiskCache;

  constructor(
    private key = process.env.TAVILY_API_KEY,
    private domains: readonly string[] = allowedDomains(),
    fetchImpl?: FetchLike,
    /** Delay before the one retry of a failed extract; negative disables it. */
    private retryMs = 2000,
  ) {
    if (!key) throw new Error("TAVILY_API_KEY is not set");
    // The real client shares one day cache per server instance; an injected fetch (tests) gets its own.
    this.fetchImpl = fetchImpl ?? ((i, init) => fetch(i, init));
    this.mem = fetchImpl ? new Map() : memory;
    const dir = process.env.TAVILY_CACHE_DIR?.trim();
    if (dir) this.disk = new DiskCache(dir);
    else if (process.env.VERCEL) this.dayDisk = new DiskCache("/tmp/fair-shift-tavily");
  }

  private dayGet<T>(kind: string, key: string): T | undefined {
    const k = `${today()}|${kind}|${key}`;
    if (this.mem.has(k)) return this.mem.get(k) as T;
    try {
      const v = this.dayDisk?.get<T>(kind, k);
      if (v !== undefined) this.mem.set(k, v);
      return v;
    } catch {
      return undefined;
    }
  }

  private daySet(kind: string, key: string, value: unknown) {
    const k = `${today()}|${kind}|${key}`;
    if (this.mem.size > 500) this.mem.clear();
    this.mem.set(k, value);
    try {
      this.dayDisk?.set(kind, k, value);
    } catch {
      /* /tmp full or read-only: memory cache only */
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(75_000),
    });
    // Error text never includes the request headers.
    if (!res.ok) throw new Error(`Tavily ${path} failed: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  async search(query: string, domains?: readonly string[]) {
    const include = narrowDomains(domains, this.domains);
    const dkey = `${query}|${[...include].sort().join(",")}`;
    const hit = this.disk?.get<SearchHit[]>("search", dkey) ?? this.dayGet<SearchHit[]>("search", dkey);
    if (hit) return { hits: hit, credits: 0 };
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
    this.disk?.set("search", dkey, hits);
    this.daySet("search", dkey, hits);
    return { hits, credits: 1 };
  }

  async extract(url: string, query?: string) {
    if (!isAllowedUrl(url, this.domains)) throw new Error("URL is not on the official domain allowlist");
    const key = url + "|" + (query || "");
    const cached = this.disk?.get<RetrievedDoc>("extract", key) ?? this.dayGet<RetrievedDoc>("extract", key);
    if (cached) return { doc: cached, credits: 0 };
    const body: Record<string, unknown> = { urls: [url], extract_depth: "basic", format: "text", timeout: 30 };
    if (query) {
      body.query = query; // reranks chunks by relevance
      body.chunks_per_source = 5;
    }
    type ExtractData = { results?: { url: string; raw_content: string; title?: string }[] };
    let data = await this.post<ExtractData>("/extract", body);
    let credits = 0.2; // basic: 1 credit per 5 successful URLs
    // Some government pages fail with basic extract (laws.mol.gov.tw times out
    // now and then). Failed URLs are not charged, so retry once with advanced
    // extract (2 credits per 5 URLs), which renders the page.
    if (!data.results?.[0]?.raw_content && this.retryMs >= 0) {
      await new Promise((r) => setTimeout(r, this.retryMs));
      data = await this.post<ExtractData>("/extract", { ...body, extract_depth: "advanced", timeout: 60 });
      credits = 0.4;
    }
    const r = data.results?.[0];
    if (!r || !r.raw_content || !isAllowedUrl(r.url || url, this.domains)) return { doc: null, credits: 0 };
    const doc: RetrievedDoc = {
      url: r.url || url,
      title: r.title || url,
      content: r.raw_content.slice(0, 60_000),
      via: "tavily_extract",
      retrievedAt: new Date().toISOString(),
    };
    this.disk?.set("extract", key, doc);
    this.daySet("extract", key, doc);
    return { doc, credits };
  }
}
