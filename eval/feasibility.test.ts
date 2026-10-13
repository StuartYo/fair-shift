import { describe, expect, it } from "vitest";
import { currentMode, modelChain } from "../lib/config";
import { NebiusProvider } from "../lib/llm/nebius";
import { TavilyProvider } from "../lib/search/tavily";
import { LSA_ALL } from "../lib/wage/catalog";
import { normaliseModelShifts } from "../lib/wage/parse";

// npm run feasibility
// The day-one go / no-go test from 選題複審.md section 6. Needs both keys.
// The Tavily half alone, for every source: npm run probe:sources (Tavily key only).
// Costs: about 6 Tavily credits and well under US$0.05 of Nemotron.
// Pass bar: Tavily finds the Taiwan and New York rate pages on official
// domains with the current numbers, and Nano parses at least 4 of 5
// Chinese schedules exactly.

const live = currentMode() === "live";

// SYNTHETIC schedules with the exact parse we expect.
const SCHEDULES: { text: string; year: number; expect: [string, string, string, number][] }[] = [
  { text: "10/5(一) 17:00-22:00\n10/7(三) 下午5點到10點", year: 2026, expect: [["2026-10-05", "17:00", "22:00", 0], ["2026-10-07", "17:00", "22:00", 0]] },
  { text: "這週班：週二 10/13 早上9點到晚上6點 中間休息1小時；週四 10/15 晚上6點半-10點半", year: 2026, expect: [["2026-10-13", "09:00", "18:00", 60], ["2026-10-15", "18:30", "22:30", 0]] },
  { text: "店長：下週排班\n10月20日 13:00~21:00（休30分）\n10月22日 大夜 23:00-07:00", year: 2026, expect: [["2026-10-20", "13:00", "21:00", 30], ["2026-10-22", "23:00", "07:00", 0]] },
  { text: "10/10 國慶日 要上班 10-16\n10/11 休息日 也來 12:00-17:00", year: 2026, expect: [["2026-10-10", "10:00", "16:00", 0], ["2026-10-11", "12:00", "17:00", 0]] },
  { text: "1/5、1/6、1/7 都是 17:00 到 22:00", year: 2027, expect: [["2027-01-05", "17:00", "22:00", 0], ["2027-01-06", "17:00", "22:00", 0], ["2027-01-07", "17:00", "22:00", 0]] },
];

describe.skipIf(!live)("day-one feasibility (live keys required)", () => {
  const tavily = live ? new TavilyProvider() : (null as unknown as TavilyProvider);

  it("Tavily finds the 2027 Taiwan hourly minimum wage (205) on mol.gov.tw", { timeout: 60_000 }, async () => {
    const { hits } = await tavily.search("勞動部 最低工資 116年1月1日起 每小時最低工資 205元", ["mol.gov.tw"]);
    console.log(hits.map((h) => h.url));
    expect(hits.some((h) => h.snippet.includes("205"))).toBe(true);
  });

  it("Tavily extracts the MOL rate history page with 196", { timeout: 60_000 }, async () => {
    const { doc } = await tavily.extract("https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/");
    expect(doc?.content).toContain("每小時最低工資為196元");
  });

  // law.moj.gov.tw returns only the page frame to Tavily (2026-10-14), so the
  // Labor Standards Act comes from the Ministry of Labor's own law database.
  it("Tavily extracts Labor Standards Act Art. 24 from laws.mol.gov.tw", { timeout: 120_000 }, async () => {
    const { doc } = await tavily.extract(LSA_ALL);
    expect(doc?.content.replace(/\s+/g, "")).toContain("按平日每小時工資額加給三分之一以上");
  });

  it("Tavily finds the New York 2026 minimum wage on dol.ny.gov", { timeout: 60_000 }, async () => {
    const { hits } = await tavily.search("New York State minimum wage 2026 New York City $17.00 per hour", ["dol.ny.gov", "labor.ny.gov"]);
    console.log(hits.map((h) => h.url));
    expect(hits.some((h) => h.snippet.includes("17.00"))).toBe(true);
  });

  it("Nemotron Nano parses Chinese schedules (at least 4 of 5 exact)", { timeout: 120_000 }, async () => {
    const llm = new NebiusProvider();
    let exact = 0;
    for (const s of SCHEDULES) {
      const r = await llm.chat(
        modelChain("nano"),
        [
          { role: "system", content: 'Extract work shifts. JSON only: {"shifts":[{"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","break_minutes":0}]}. 24-hour times. Use the given year.' },
          { role: "user", content: `Year: ${s.year}\n${s.text}` },
        ],
        { jsonMode: true, maxTokens: 800, temperature: 0 },
      );
      let rows: unknown[] = [];
      try {
        rows = JSON.parse(r.message.content || "{}").shifts || [];
      } catch {
        rows = [];
      }
      const got = normaliseModelShifts(rows as never).shifts.map((x) => [x.date, x.start, x.end, x.breakMinutes]);
      const ok = JSON.stringify(got) === JSON.stringify(s.expect);
      if (ok) exact++;
      console.log(r.model, ok ? "exact" : "MISMATCH", JSON.stringify(got));
    }
    expect(exact).toBeGreaterThanOrEqual(4);
  });
});

describe.skipIf(live)("day-one feasibility", () => {
  it("is skipped until NEBIUS_API_KEY and TAVILY_API_KEY are set", () => {
    expect(live).toBe(false);
  });
});
