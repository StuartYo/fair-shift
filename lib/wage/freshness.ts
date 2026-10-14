import type { AgentSession } from "../agent/session";
import { urlKey } from "../agent/citations";
import type { Citation, RetrievedDoc } from "../types";
import type { Jurisdiction, RuleRecord } from "./types";

// Freshness check with Tavily search. The seed pages in the catalog are a
// snapshot; rates and their legal status change after they were chosen. Each
// check runs one search on the official sites for the latest shift year, in
// parallel with parsing, and code uses the results in two ways:
//  1. Status of a pending rate (Taiwan). The 2027 minimum wage was decided by
//     the Minimum Wage Council on 2026-09-24 ("陳報行政院核定"). If the search
//     finds the Executive Yuan's news release saying the cabinet heard the
//     report and announced the raise, code fetches that page and, when the
//     sentence (rate and year) and the release date can be quoted verbatim,
//     records the newer status with those quotes.
//  2. Years the seeds do not cover. For shift dates after the newest seeded
//     year, result pages that talk about that year's minimum wage are handed to
//     the agent as extra pages to fetch (they are labelled "found by search").
// Every fact taken from a search result is labelled as such on the result page.

/** Newest year the seed pages state a minimum wage for. */
export const SEED_MAX_YEAR: Record<Jurisdiction, number> = { TW: 2027, "US-NY": 2027 };

export interface SearchNote {
  query: string;
  domains: string[];
  results: { url: string; title: string }[];
  /** What code did with the results. */
  outcome: { en: string; zh: string };
  /** True when a fact or a page on the result page came from this search. */
  contributed: boolean;
}

export function freshnessQuery(j: Jurisdiction, dates: string[]): { query: string; domains: string[]; year: number } | null {
  const year = Number([...dates].sort().at(-1)?.slice(0, 4));
  if (!Number.isFinite(year) || year < 2000) return null;
  // A future year's rate is the one whose approval may be under way: look for the cabinet's news release.
  if (j === "TW" && year > new Date().getUTCFullYear())
    return { year, query: `行政院會 聽取 勞動部 最低工資調整 報告 明（${year}）年 時薪`, domains: ["ey.gov.tw", "mol.gov.tw"] };
  if (j === "TW") return { year, query: `${year - 1911}年 每小時最低工資 勞動部 公告 調整`, domains: ["mol.gov.tw"] };
  return { year, query: `New York State minimum wage ${year} per hour`, domains: ["dol.ny.gov", "labor.ny.gov"] };
}

/** An Executive Yuan news article (not a listing page). */
const EY_ARTICLE = /^https?:\/\/(?:www\.)?ey\.gov\.tw\/Page\/[0-9A-F]{16}\/[0-9a-f-]{36}/i;

export interface FreshnessStart {
  note?: SearchNote;
  /** Pages for the agent to fetch, found by search (years the seeds do not cover). */
  extraPages: { url: string; focus: string; for: string[] }[];
}

/**
 * Run the search. Pages worth reading are fetched right away (in parallel with
 * the rest of the run), so the status check needs no extra wait.
 */
export async function startFreshness(session: AgentSession, j: Jurisdiction, dates: string[], seeds: string[]): Promise<FreshnessStart> {
  const q = freshnessQuery(j, dates);
  if (!q) return { extraPages: [] };
  let hits: { url: string; title: string; snippet: string }[] = [];
  try {
    hits = await session.searchOfficial(q.query, q.domains);
  } catch (e) {
    session.emit({ kind: "guard", name: "search_failed", detail: (e as Error).message.slice(0, 100), detailZh: "搜尋沒有成功，這次只用預設的官方網頁。" });
    return { extraPages: [] };
  }
  const seedKeys = new Set(seeds.map(urlKey));
  const extraPages: FreshnessStart["extraPages"] = [];
  const note: SearchNote = {
    query: q.query,
    domains: q.domains,
    results: hits.slice(0, 5).map((h) => ({ url: h.url, title: h.title })),
    outcome: { en: "No newer notice than the pages used.", zh: "沒有找到比這次所用網頁更新的公告。" },
    contributed: false,
  };
  // A rate for a future year is the one that can still be pending: only then read the cabinet's news release.
  if (j === "TW" && q.year > new Date().getUTCFullYear()) {
    // News articles (not listing pages) whose result text mentions the hourly rate being raised; at most two.
    const articles = hits
      .filter((h) => EY_ARTICLE.test(h.url) && /最低工資/.test(h.title + h.snippet))
      .sort((a, b) => Number(/時薪[^。]*(調增至|調整至|調升至)/.test(b.snippet)) - Number(/時薪[^。]*(調增至|調整至|調升至)/.test(a.snippet)))
      .slice(0, 2);
    await Promise.all(articles.map((a) => session.fetchOfficial(a.url, "", "search").catch(() => null)));
  }
  if (q.year > SEED_MAX_YEAR[j]) {
    const word = j === "TW" ? /每小時最低工資|時薪/ : /minimum wage/i;
    const yearWord = j === "TW" ? new RegExp(`${q.year - 1911}年|${q.year}`) : new RegExp(String(q.year));
    for (const h of hits) {
      if (seedKeys.has(urlKey(h.url)) || !word.test(h.title + h.snippet) || !yearWord.test(h.title + h.snippet)) continue;
      extraPages.push({ url: h.url, focus: j === "TW" ? "每小時最低工資 自 年1月1日起" : `minimum wage ${q.year} per hour`, for: [j === "TW" ? "tw.min_wage_hourly" : "ny.min_wage_hourly"] });
      if (extraPages.length >= 2) break;
    }
    if (extraPages.length) {
      note.contributed = true;
      note.outcome = {
        en: `The seed pages stop at ${SEED_MAX_YEAR[j]}; search found ${extraPages.length} official page(s) about ${q.year} for the agent to read.`,
        zh: `預設網頁只寫到 ${SEED_MAX_YEAR[j]} 年；搜尋找到 ${extraPages.length} 個談 ${q.year} 年的官方網頁，交給代理去讀。`,
      };
    } else {
      note.outcome = {
        en: `The seed pages stop at ${SEED_MAX_YEAR[j]} and search found no official page with a ${q.year} rate.`,
        zh: `預設網頁只寫到 ${SEED_MAX_YEAR[j]} 年，搜尋也沒找到寫 ${q.year} 年費率的官方網頁。`,
      };
    }
  }
  return { note, extraPages };
}

const rocToIso = (y: string, m: string, d: string) => `${Number(y) + 1911}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

/**
 * Taiwan: upgrade a pending minimum wage to "the cabinet heard the report and
 * announced the raise" when a page found by search says so. Both quotes (the
 * sentence with the rate and year, and the release date) must be verbatim in
 * the retrieved page. Returns what changed, for the search note.
 */
export function applyStatusCheck(rules: RuleRecord[], docs: RetrievedDoc[], verify: (url: string, quote: string) => { ok: true; citation: Citation } | { ok: false; reason: string }): string[] {
  const changed: string[] = [];
  const pages = docs.filter((d) => d.foundBy === "search" && d.via.endsWith("extract") && /ey\.gov\.tw/i.test(d.url));
  for (const r of rules) {
    if (r.key !== "tw.min_wage_hourly" || r.status !== "pending_approval" || !r.effectiveFrom) continue;
    const year = Number(r.effectiveFrom.slice(0, 4));
    for (const d of pages) {
      const text = d.content.replace(/\s+/g, " ");
      const sentence = [...text.matchAll(/行政院長[^。]{0,30}?行政院會[^。]*?最低工資[^。]*?時薪[^。]*?(\d+)\s*元。/g)].find(
        (m) => Number(m[1]) === r.value && (m[0].includes(String(year)) || m[0].includes(`${year - 1911}年`)),
      );
      const date = text.match(/日期[：:]\s*(\d{2,3})-(\d{1,2})-(\d{1,2})/);
      if (!sentence || !date) continue;
      const a = verify(d.url, sentence[0]);
      const b = verify(d.url, date[0]);
      if (!a.ok || !b.ok) continue;
      r.status = "cabinet_announced";
      r.statusDate = rocToIso(date[1], date[2], date[3]);
      r.citations = [...r.citations, a.citation, b.citation];
      changed.push(`${r.value} from ${r.effectiveFrom}`);
      break;
    }
  }
  return changed;
}
