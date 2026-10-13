import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DocStore } from "../lib/agent/citations";
import { pageView } from "../lib/agent/session";
import { TavilyProvider } from "../lib/search/tavily";
import { twHolidayActUrl } from "../lib/wage/catalog";
import { fallbackRules, flatText } from "../lib/wage/fallback";
import { verifyRule } from "../lib/wage/verify";

// Fixes from the first real Tavily run (2026-10-14).

const LSA = "https://laws.mol.gov.tw/FLAW/FLAWDAT0201.aspx?id=FL014930";
// As the MOL law database serves it: hard line breaks inside clauses.
const WRAPPED = `第 24 條
雇主延長勞工工作時間者，其延長工作時間之工資，依下列標準加給：
一、延長工作時間在二小時以內者，按平日每小時工資額加給三分之一以
    上。
二、再延長工作時間在二小時以內者，按平日每小時工資額加給三分之二
    以上。`;

describe("hard-wrapped law text", () => {
  it("joins CJK lines so the clause patterns match, and the quote still verifies", () => {
    expect(flatText("加給三分之一以\n    上。 New York")).toBe("加給三分之一以上。 New York");
    const doc = { url: LSA, title: "LSA", content: WRAPPED, via: "tavily_extract" as const, retrievedAt: "" };
    const props = fallbackRules([doc], ["tw.ot_first2", "tw.ot_next2"]);
    expect(props.map((p) => p.key).sort()).toEqual(["tw.ot_first2", "tw.ot_next2"]);
    const store = new DocStore();
    store.add(doc);
    for (const p of props) expect(verifyRule(p, store, "TW", "code_fallback").ok).toBe(true);
  });
});

describe("pageView (what fetch_official shows the model)", () => {
  const filler = (n: number) => Array.from({ length: n }, (_, i) => `第 ${i} 條\n${"其他條文內容。".repeat(40)}`).join("\n");
  const long = filler(10) + "\n" + WRAPPED + "\n" + filler(10);
  it("returns short pages whole", () => {
    expect(pageView("short", "x")).toEqual({ text: "short" });
  });
  it("shows the start of a long page without focus, and says so", () => {
    const v = pageView(long, "");
    expect(v.text.length).toBe(4000);
    expect(v.note).toMatch(/focus/);
  });
  it("shows the matching part of a long page, verbatim", () => {
    const v = pageView(long, "延長工作時間 加給三分之一");
    expect(v.text.length).toBeLessThanOrEqual(4000 + 20);
    expect(v.text).toContain("按平日每小時工資額加給三分之一以\n    上。");
    for (const part of v.text.split("\n[...]\n")) expect(long).toContain(part);
  });
});

describe("Taiwan holiday act source", () => {
  it("uses the DGPA calendar page of the shift year, else the latest", () => {
    expect(twHolidayActUrl(["2026-10-10"])).toContain("pid=12573");
    expect(twHolidayActUrl(["2027-02-06"])).toContain("pid=12982");
    expect(twHolidayActUrl(["2030-01-01"])).toContain("pid=12982");
  });
});

describe("TavilyProvider retry and disk cache", () => {
  let dir = "";
  afterEach(() => {
    delete process.env.TAVILY_CACHE_DIR;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("retries a failed basic extract once with advanced extract", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fn = async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      bodies.push(b);
      const ok = b.extract_depth === "advanced";
      return new Response(JSON.stringify(ok ? { results: [{ url: LSA, raw_content: WRAPPED }] } : { results: [], failed_results: [{ url: LSA, error: "Request timed out" }] }));
    };
    const t = new TavilyProvider("tvly-test-not-real", ["mol.gov.tw"], fn, 0);
    const r = await t.extract(LSA);
    expect(bodies.map((b) => b.extract_depth)).toEqual(["basic", "advanced"]);
    expect(r.doc?.content).toBe(WRAPPED);
    expect(r.credits).toBeCloseTo(0.4);
  });

  it("reuses pages from TAVILY_CACHE_DIR without calling the API", async () => {
    dir = mkdtempSync(join(tmpdir(), "fs-cache-"));
    process.env.TAVILY_CACHE_DIR = dir;
    let calls = 0;
    const fn = async () => {
      calls++;
      return new Response(JSON.stringify({ results: [{ url: LSA, raw_content: "text" }] }));
    };
    const a = await new TavilyProvider("tvly-test-not-real", ["mol.gov.tw"], fn, 0).extract(LSA);
    const b = await new TavilyProvider("tvly-test-not-real", ["mol.gov.tw"], fn, 0).extract(LSA);
    expect(calls).toBe(1);
    expect(a.credits).toBeCloseTo(0.2);
    expect(b.credits).toBe(0);
    expect(b.doc?.content).toBe("text");
    expect(readdirSync(dir).length).toBe(1);
  });
});
