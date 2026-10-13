import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DocStore } from "../lib/agent/citations";
import { DEFAULT_ALLOWED_DOMAINS } from "../lib/domains";
import { TavilyProvider } from "../lib/search/tavily";
import type { RetrievedDoc } from "../lib/types";
import { LSA_ALL, LSA_RULES_ALL, MOL_2027, MOL_HISTORY, MOL_HOURLY, NY_CR142, NY_CR146 } from "../lib/wage/catalog";
import { fallbackHolidays, fallbackLunarHolidays, fallbackRules } from "../lib/wage/fallback";
import { DGPA_CALENDARS } from "../lib/wage/holidays-tw";
import type { RuleKey } from "../lib/wage/types";
import { verifyHoliday, verifyRule } from "../lib/wage/verify";

// npm run probe:sources   (needs TAVILY_API_KEY only; never calls Nebius)
// Day-one feasibility, Tavily half: can Tavily find and extract every official
// page the rules depend on, does the text contain the number or date verbatim,
// and does the verifier accept the value read from it?
// Pages are cached in TAVILY_CACHE_DIR (default .cache/tavily, gitignored), so a
// rerun costs nothing. Writes eval/results/sources-<time>.md.

const hasKey = !!process.env.TAVILY_API_KEY;
process.env.TAVILY_CACHE_DIR ||= ".cache/tavily";

interface Source {
  name: string;
  url: string;
  /** Search that should find this URL (or a page on the same site). */
  search?: { query: string; domains: string[] };
  /** Text that must appear verbatim (after whitespace removal). */
  needles: string[];
  /** Rule keys the verifier should accept from this page alone. */
  keys?: RuleKey[];
  holidays?: "act";
}

// law.moj.gov.tw: the canonical law database. Kept here to document that Tavily
// returns only the page frame from it (no article text).
const LSA = (n: number) => `https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=${n}`;
const MOJ_RULES_20_1 = "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030002&flno=20-1";
const MOJ_HOLIDAY_ACT = "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0020095";
const MOL_HOLIDAY_PAY = "https://www.mol.gov.tw/1607/28162/28166/28180/81521/81533/";

export const SOURCES: Source[] = [
  {
    name: "MOL minimum wage history (2026 rate 196)",
    url: MOL_HISTORY,
    search: { query: "勞動部 歷年最低工資 每小時最低工資為196元 115年1月1日起實施", domains: ["mol.gov.tw"] },
    needles: ["每小時最低工資為196元"],
    keys: ["tw.min_wage_hourly"],
  },
  {
    name: "MOL 2027 decision (205, pending)",
    url: MOL_2027,
    search: { query: "最低工資審議會 116年1月1日起 每小時最低工資 205元", domains: ["mol.gov.tw"] },
    needles: ["205元", "陳報行政院核定"],
    keys: ["tw.min_wage_hourly"],
  },
  {
    name: "LSA Art. 24 on law.moj.gov.tw (old seed)",
    url: LSA(24),
    search: { query: "勞動基準法 第24條 延長工作時間 加給三分之一", domains: ["law.moj.gov.tw"] },
    needles: ["加給三分之一"],
    keys: ["tw.ot_first2"],
  },
  { name: "LSA Art. 39 on law.moj.gov.tw (old seed)", url: LSA(39), needles: ["工資應加倍發給"], keys: ["tw.holiday"] },
  { name: "LSA Art. 40 on law.moj.gov.tw (old seed)", url: LSA(40), needles: ["停止假期之工資"], keys: ["tw.day_off"] },
  {
    name: "LSA Enforcement Rules Art. 20-1 on law.moj.gov.tw (old seed)",
    url: MOJ_RULES_20_1,
    search: { query: "勞動基準法施行細則 第20條之1 每週工作總時數超過四十小時", domains: ["law.moj.gov.tw"] },
    needles: ["每週工作總時數超過四十小時"],
    keys: ["tw.weekly_hours"],
  },
  { name: "紀念日及節日實施條例 on law.moj.gov.tw (old seed)", url: MOJ_HOLIDAY_ACT, needles: ["國慶日", "均放假一日"], holidays: "act" },
  {
    name: "Labor Standards Act, MOL law database (new seed: Art. 24, 39, 40)",
    url: LSA_ALL,
    needles: ["加給三分之一", "加給三分之二", "另再加給一又三分之一", "另再加給一又三分之二", "工資應加倍發給", "停止假期之工資"],
    keys: ["tw.ot_first2", "tw.ot_next2", "tw.rest_first2", "tw.rest_after2", "tw.holiday", "tw.day_off"],
  },
  {
    name: "LSA Enforcement Rules, MOL law database (new seed: Art. 20-1)",
    url: LSA_RULES_ALL,
    needles: ["每週工作總時數超過四十小時"],
    keys: ["tw.weekly_hours"],
  },
  { name: "MOL hourly workers page (dropped as seed)", url: MOL_HOURLY, needles: ["休息日"] },
  { name: "MOL holiday pay page (dropped as seed: image only)", url: MOL_HOLIDAY_PAY, needles: ["加倍"] },
  {
    name: "DGPA calendar 2026 page (new holiday act seed)",
    url: DGPA_CALENDARS["2026"].url,
    search: { query: "行政院人事行政總處 115年政府行政機關辦公日曆表", domains: ["dgpa.gov.tw"] },
    needles: ["國慶日：十月十日", "下列紀念日均放假一日", "中秋節：均放假一日"],
    holidays: "act",
  },
  {
    name: "DGPA calendar 2027 page (new holiday act seed)",
    url: DGPA_CALENDARS["2027"].url,
    search: { query: "行政院人事行政總處 116年政府行政機關辦公日曆表", domains: ["dgpa.gov.tw"] },
    needles: ["國慶日：十月十日", "下列紀念日均放假一日", "除夕及春節：自農曆十二月末日之前一日至翌年一月三日，放假五日"],
    holidays: "act",
  },
  {
    name: "NYS DOL minimum wage page",
    url: "https://dol.ny.gov/minimum-wage-0",
    search: { query: "New York State minimum wage 2026 New York City $17.00 per hour", domains: ["dol.ny.gov", "labor.ny.gov"] },
    needles: ["$17.00"],
    keys: ["ny.min_wage_hourly"],
  },
  {
    name: "NYS DOL fact sheet P700",
    url: "https://dol.ny.gov/system/files/documents/2025/12/p700_12-25.pdf",
    needles: ["$17.00", "1 ½ times"],
    keys: ["ny.min_wage_hourly", "ny.ot_weekly"],
  },
  {
    name: "NYS Hospitality Wage Order CR146 (40-page PDF)",
    url: NY_CR146,
    search: { query: "New York Hospitality Industry Wage Order Part 146 tip credit spread of hours", domains: ["dol.ny.gov", "labor.ny.gov"] },
    needles: ["$11.35 Cash Wage, $5.65 Credit", "spread of hours exceeds 10", "before subtracting any tip credit"],
    keys: ["ny.tip_credit", "ny.ot_tipped", "ny.spread_hosp"],
  },
  { name: "NYS Misc. Industries Wage Order CR142", url: NY_CR142, needles: ["spread of hours exceeds 10 hours"], keys: ["ny.spread_misc"] },
];

const flat = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");

interface Row {
  name: string;
  url: string;
  searchFound?: string;
  extracted: boolean;
  chars: number;
  needles: { text: string; found: boolean }[];
  verified: string[];
  rejected: string[];
}

describe.skipIf(!hasKey)("official sources via Tavily (live, Tavily only)", () => {
  it("finds, extracts and verifies every seed source", { timeout: 10 * 60_000 }, async () => {
    const tavily = new TavilyProvider(undefined, [...DEFAULT_ALLOWED_DOMAINS, "dgpa.gov.tw"]);
    const rows: Row[] = [];
    let credits = 0;
    for (const s of SOURCES) {
      const row: Row = { name: s.name, url: s.url, extracted: false, chars: 0, needles: [], verified: [], rejected: [] };
      if (s.search) {
        const r = await tavily.search(s.search.query, s.search.domains);
        credits += r.credits;
        const same = r.hits.find((h) => h.url.replace(/\/$/, "") === s.url.replace(/\/$/, ""));
        row.searchFound = same ? "seed URL in top 5" : r.hits.length ? `other: ${r.hits[0].url}` : "no results";
      }
      let doc: RetrievedDoc | null = null;
      try {
        const e = await tavily.extract(s.url);
        credits += e.credits;
        doc = e.doc;
      } catch (e) {
        row.rejected.push(`extract error: ${(e as Error).message}`);
      }
      if (doc) {
        row.extracted = true;
        row.chars = doc.content.length;
        const store = new DocStore();
        store.add(doc);
        row.needles = s.needles.map((n) => ({ text: n, found: flat(doc!.content).includes(flat(n)) }));
        if (s.keys) {
          const props = fallbackRules([doc], s.keys);
          for (const k of s.keys) if (!props.some((p) => p.key === k)) row.rejected.push(`${k}: clause pattern not found`);
          for (const p of props) {
            const v = verifyRule(p, store, s.keys[0].startsWith("ny.") ? "US-NY" : "TW", "code_fallback");
            const tag = `${p.key}=${p.value}${p.effective_from ? `@${p.effective_from}` : ""}${p.region ? `/${p.region}` : ""}${p.variant ? `/${p.variant}` : ""}`;
            if (v.ok) row.verified.push(tag);
            else row.rejected.push(`${tag}: ${v.reason}`);
          }
        }
        if (s.holidays === "act") {
          for (const h of fallbackHolidays([doc])) {
            const v = verifyHoliday(h, store, "code_fallback");
            (v.ok ? row.verified : row.rejected).push(`holiday ${h.name} ${h.month_day}${v.ok ? "" : `: ${v.reason}`}`);
          }
          for (const h of fallbackLunarHolidays([doc], ["2026-09-25", "2027-02-06"])) {
            const v = verifyHoliday(h, store, "code_fallback");
            (v.ok ? row.verified : row.rejected).push(`holiday ${h.name} ${h.date}${v.ok ? "" : `: ${v.reason}`}`);
          }
        }
      }
      rows.push(row);
    }
    for (const r of rows) r.verified = [...new Set(r.verified)];
    const lines = [
      `# Official sources via Tavily`,
      ``,
      `Run ${new Date().toISOString()}. Tavily credits charged this run (cache misses only, estimated): ${credits.toFixed(1)}.`,
      ``,
      `| Source | Search finds it? | Extract | Text verbatim | Verifier accepts |`,
      `|---|---|---|---|---|`,
      ...rows.map(
        (r) =>
          `| [${r.name}](${r.url}) | ${r.searchFound ?? "(seed URL, not searched)"} | ${r.extracted ? `yes, ${r.chars} chars` : "**no**"} | ${r.needles.map((n) => `${n.found ? "yes" : "**NO**"} \`${n.text}\``).join("<br>")} | ${r.verified.join("<br>") || "-"}${r.rejected.length ? `<br>**rejected:** ${r.rejected.join("; ")}` : ""} |`,
      ),
    ];
    mkdirSync("eval/results", { recursive: true });
    const f = `eval/results/sources-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
    writeFileSync(f, lines.join("\n") + "\n");
    console.log(lines.join("\n"));
    expect(rows.length).toBe(SOURCES.length);
  });
});
