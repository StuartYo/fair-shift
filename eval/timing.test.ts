import { it } from "vitest";
import fixtures from "../fixtures/official-pages.json";
import { getProviders } from "../lib/providers";
import type { FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { runFairShift } from "../lib/wage/run";
import { EVAL_CASES } from "./cases";
import { HELDOUT_CASES } from "./heldout";

// npm run timing: one run of one case (TIMING_CASE, default the hero sample) with
// the step timeline, to see where the seconds go. Live when both keys are set.
it("times one run", { timeout: 10 * 60_000 }, async () => {
  const id = process.env.TIMING_CASE || "tw-holiday-unpaid";
  const c = [...EVAL_CASES, ...HELDOUT_CASES].find((x) => x.id === id);
  if (!c) throw new Error(`no case ${id}`);
  const p = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });
  const t0 = Date.now();
  const r = await runFairShift(c.input, { llm: p.llm, search: p.search, mode: p.mode, modeNote: p.modeNote });
  for (const s of r.trace) console.log(`${(s.t / 1000).toFixed(1).padStart(5)}s ${s.kind.padEnd(5)} ${s.name.padEnd(18)} ${s.detail.slice(0, 110)}`);
  console.log("min wage:", r.rules.filter((x) => x.key.endsWith("min_wage_hourly")).map((x) => `${x.value} ${x.effectiveFrom} ${x.status} ${x.statusDate ?? ""}`).join(" | "));
  console.log("search:", JSON.stringify(r.searchNotes?.map((n) => [n.contributed, n.outcome.en.slice(0, 90)])));
  console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s, expected ${r.computation.expectedTotal} (truth ${c.expected.expectedTotal}), US$${r.usage.estCostUsd.toFixed(4)}, ${r.usage.promptTokens} in / ${r.usage.completionTokens} out, Tavily ${r.usage.tavilyCredits}`);
});
