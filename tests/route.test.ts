import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../app/api/check/route";
import { GET as status } from "../app/api/status/route";
import { SAMPLE_CASES } from "../eval/samples";
import saved from "../fixtures/precomputed.json";
import { _resetBudget } from "../lib/budget";

// The public API: caps, saved results for samples, and what /api/status reports.

const hero = SAMPLE_CASES.find((c) => c.id === "tw-holiday-unpaid")!;
const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
  _resetBudget();
});

const req = (body: unknown, ip = "203.0.113.7") =>
  new Request("http://localhost/api/check", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body) });

async function events(res: Response): Promise<{ type: string; report?: { precomputed?: { reason: string }; computation: { shortfall?: number } }; partial?: boolean }[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("/api/check", () => {
  it("streams steps, a partial result, then the final result", async () => {
    _resetBudget();
    const ev = await events(await POST(req({ ...hero.input, sampleId: hero.id })));
    expect(ev[0].type).toBe("mode");
    expect(ev.some((e) => e.type === "step")).toBe(true);
    const reports = ev.filter((e) => e.type === "report");
    expect(reports.length).toBe(2);
    expect(reports[0].partial).toBe(true);
    expect(reports.at(-1)!.report!.computation.shortfall).toBe(1176);
  });

  it("over the daily cap: a sample gets its saved live result, labelled; other input gets 429", async () => {
    process.env.APP_GLOBAL_RUNS_PER_DAY = "0.5"; // the first check uses the only run
    _resetBudget();
    await POST(req({ ...hero.input, sampleId: hero.id })).then((r) => r.text());
    const own = await POST(req({ ...hero.input, scheduleText: hero.input.scheduleText + "\n10/13 17:00-22:00" }));
    expect(own.status).toBe(429);
    const sample = await POST(req({ ...hero.input, sampleId: hero.id }));
    if ((saved as { ranAt: string | null }).ranAt) {
      const ev = await events(sample);
      const r = ev.find((e) => e.type === "report")!.report!;
      expect(r.precomputed?.reason).toBe("limit");
      expect(r.computation.shortfall).toBe(1176);
    } else expect(sample.status).toBe(429);
  });
});

describe("/api/status", () => {
  it("reports the caps the README states and says they are per instance", async () => {
    const j = await (await status()).json();
    expect(j.caps).toMatchObject({ globalRunsPerDay: 60, globalUsdPerDay: 1.5, globalTavilyCreditsPerDay: 40, perRunUsd: 0.05 });
    expect(j.capsScope).toBe("per server instance");
    expect(JSON.stringify(j)).not.toMatch(/tvly-|sk-/);
  });
});
