import { describe, expect, it } from "vitest";
import { TavilyProvider } from "../lib/search/tavily";

const KEY = "tvly-test-not-real";
const D = ["law.moj.gov.tw", "ftc.gov"];

function fakeFetch(payload: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(payload), { status });
  };
  return { calls, fn };
}

describe("TavilyProvider", () => {
  it("searches only allowlisted domains and drops off-domain results", async () => {
    const f = fakeFetch({
      results: [
        { url: "https://law.moj.gov.tw/a", title: "A", content: "official" },
        { url: "https://blog.example.com/b", title: "B", content: "not official" },
      ],
    });
    const t = new TavilyProvider(KEY, D, f.fn);
    const r = await t.search("query", ["ftc.gov", "evil.com"]);
    const body = JSON.parse(String(f.calls[0].init?.body));
    expect(f.calls[0].url).toBe("https://api.tavily.com/search");
    expect(body.include_domains).toEqual(["ftc.gov"]);
    expect((f.calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    // law.moj.gov.tw is outside the narrowed set and the blog is off-list: both dropped
    expect(r.hits).toEqual([]);
  });
  it("keeps on-domain results", async () => {
    const f = fakeFetch({ results: [{ url: "https://www.ftc.gov/x", title: "X", content: "c" }] });
    const r = await new TavilyProvider(KEY, D, f.fn).search("q");
    expect(r.hits.map((h) => h.url)).toEqual(["https://www.ftc.gov/x"]);
    expect(r.credits).toBe(1);
  });
  it("refuses to extract a non-official URL without calling the API", async () => {
    const f = fakeFetch({});
    await expect(new TavilyProvider(KEY, D, f.fn).extract("https://example.com/page")).rejects.toThrow(/allowlist/);
    expect(f.calls.length).toBe(0);
  });
  it("extracts and caches an official page", async () => {
    const f = fakeFetch({ results: [{ url: "https://law.moj.gov.tw/a", raw_content: "rule text" }] });
    const t = new TavilyProvider(KEY, D, f.fn);
    const a = await t.extract("https://law.moj.gov.tw/a", "focus");
    const b = await t.extract("https://law.moj.gov.tw/a", "focus");
    expect(a.doc?.content).toBe("rule text");
    expect(b.credits).toBe(0);
    expect(f.calls.length).toBe(1);
  });
  it("does not leak the key in errors", async () => {
    const f = fakeFetch({ error: "bad" }, 401);
    const err = await new TavilyProvider(KEY, D, f.fn).search("q").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/HTTP 401/);
    expect((err as Error).message).not.toContain(KEY);
  });
});
