import { allowedDomains, isAllowedUrl, narrowDomains } from "../domains";
import type { RetrievedDoc } from "../types";
import type { SearchHit, SearchProvider } from "./provider";

// Demo-mode stand-in for Tavily. Serves recorded documents from a fixture set.
// Every result is tagged fixture_search / fixture_extract so the UI can label it.
// The app supplies its own fixture set (text recorded from real official pages).

export interface FixtureDoc {
  url: string;
  title: string;
  content: string;
  /** Date this page was recorded, if different from the set. */
  recordedOn?: string;
}

export interface FixtureSet {
  _note: string;
  recordedOn: string;
  docs: FixtureDoc[];
}

function tokens(s: string): Set<string> {
  const out = new Set<string>();
  const lower = s.toLowerCase();
  for (const w of lower.match(/[a-z0-9]{3,}/g) || []) out.add(w);
  const cjk = lower.replace(/[^㐀-鿿]/g, "");
  for (let i = 0; i < cjk.length - 1; i++) out.add(cjk.slice(i, i + 2));
  return out;
}

function score(query: string, doc: FixtureDoc): number {
  const d = tokens(doc.title + " " + doc.content);
  const t = tokens(doc.title);
  let s = 0;
  for (const k of tokens(query)) {
    if (d.has(k)) s += 1;
    if (t.has(k)) s += 2;
  }
  return s;
}

function snippet(query: string, content: string, len = 400): string {
  const q = [...tokens(query)];
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.max(1, content.length); i += 50) {
    const win = content.slice(i, i + len).toLowerCase();
    const sc = q.reduce((a, k) => a + (win.includes(k) ? 1 : 0), 0);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  return content.slice(best, best + len);
}

export class FixtureSearchProvider implements SearchProvider {
  readonly kind = "fixture" as const;
  constructor(
    private set: FixtureSet,
    private domains: readonly string[] = allowedDomains(),
  ) {}

  async search(query: string, domains?: readonly string[]) {
    const include = narrowDomains(domains, this.domains);
    const hits: SearchHit[] = this.set.docs
      .filter((d) => isAllowedUrl(d.url, include))
      .map((d) => ({ d, s: score(query, d) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map(({ d }) => ({ url: d.url, title: d.title, snippet: snippet(query, d.content) }));
    return { hits, credits: 0 };
  }

  async extract(url: string) {
    if (!isAllowedUrl(url, this.domains)) throw new Error("URL is not on the official domain allowlist");
    const d = this.set.docs.find((x) => x.url === url);
    if (!d) return { doc: null, credits: 0 };
    const doc: RetrievedDoc = { url: d.url, title: d.title, content: d.content, via: "fixture_extract", retrievedAt: d.recordedOn ?? this.set.recordedOn };
    return { doc, credits: 0 };
  }
}
