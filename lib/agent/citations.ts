import type { Citation, RetrievedDoc } from "../types";

// A citation is accepted only if its quote appears verbatim in content that was
// actually retrieved during this run. Normalisation only removes whitespace and
// folds full-width / half-width forms; it never paraphrases.

export function normalise(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, "").replace(/[「」『』"“”'‘’]/g, "").toLowerCase();
}

/** Key a URL for comparison: ignore fragments, trailing slashes, http/https and casing of host. */
export function urlKey(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

export class DocStore {
  private docs = new Map<string, RetrievedDoc[]>();

  add(doc: RetrievedDoc) {
    const k = urlKey(doc.url);
    const list = this.docs.get(k) || [];
    list.push(doc);
    this.docs.set(k, list);
  }

  has(url: string): boolean {
    return this.docs.has(urlKey(url));
  }

  /** The first full-page copy of a URL retrieved in this run (not a search snippet). */
  page(url: string): RetrievedDoc | undefined {
    return (this.docs.get(urlKey(url)) || []).find((d) => d.via.endsWith("extract"));
  }

  all(): RetrievedDoc[] {
    return [...this.docs.values()].flat();
  }

  /** Returns a verified citation, or a reason why the quote was rejected. */
  verify(url: string, quote: string): { ok: true; citation: Citation } | { ok: false; reason: string } {
    const list = this.docs.get(urlKey(url));
    if (!list) return { ok: false, reason: "URL was not retrieved in this run. Call search_rules or fetch_rule first." };
    const q = normalise(quote);
    if (q.length < 6) return { ok: false, reason: "Quote is too short. Copy at least one full clause from the source." };
    if (q.length > 600) return { ok: false, reason: "Quote is too long. Copy only the clause that supports the finding." };
    // Prefer full-page extracts over search snippets when both contain the quote.
    const ordered = [...list].sort((a, b) => Number(b.via.endsWith("extract")) - Number(a.via.endsWith("extract")));
    for (const d of ordered) {
      if (normalise(d.content).includes(q)) {
        return { ok: true, citation: { url: d.url, title: d.title, quote: quote.trim(), verified: true, via: d.via, foundBy: d.foundBy } };
      }
    }
    // Same words on another page retrieved in this run: say where, so the model can fix the source_url.
    for (const [k, docs] of this.docs) {
      if (k === urlKey(url)) continue;
      const d = docs.find((x) => normalise(x.content).includes(q));
      if (d) return { ok: false, reason: `This quote is on ${d.url}, not on ${url}. Use that page as source_url.` };
    }
    return { ok: false, reason: "Quote not found verbatim in the retrieved text. Copy the exact words from the tool result." };
  }

  /**
   * The normalised text before each place the quote appears in retrieved copies
   * of this URL (up to `before` characters). Lets code check which heading a
   * quoted line sits under, e.g. the region of a rate table row.
   */
  contextsBefore(url: string, quote: string, before = 3000): string[] {
    const q = normalise(quote);
    const out: string[] = [];
    if (!q) return out;
    for (const d of this.docs.get(urlKey(url)) || []) {
      const t = normalise(d.content);
      for (let i = t.indexOf(q); i >= 0; i = t.indexOf(q, i + 1)) out.push(t.slice(Math.max(0, i - before), i));
    }
    return out;
  }

  /** Code-side fallback: attach a citation when retrieved text contains the rule's anchor quote. */
  findAnchor(url: string, anchor: string): Citation | null {
    const r = this.verify(url, anchor);
    return r.ok ? r.citation : null;
  }
}
