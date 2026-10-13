import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "../eval/cases";
import fixtures from "../fixtures/official-pages.json";
import { MockProvider } from "../lib/llm/mock";
import { FixtureSearchProvider, type FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { runFairShift } from "../lib/wage/run";

// Full pipeline in demo mode: scripted agent + recorded official pages.
// Checks that every eval case comes out exactly as hand-computed, and that every
// rule used carries a verified citation.

describe("eval cases through the full pipeline (demo mode)", () => {
  for (const c of EVAL_CASES) {
    it(`${c.id}: ${c.title}`, async () => {
      const r = await runFairShift(c.input, {
        llm: new MockProvider(rulesMockScript()),
        search: new FixtureSearchProvider(fixtures as FixtureSet),
        mode: "mock",
        modeNote: "test",
        today: "2026-10-13",
      });
      expect(r.shifts.length).toBe(c.expected.shifts);
      expect(r.computation.workedHours).toBe(c.expected.workedHours);
      expect(r.computation.expectedTotal).toBeCloseTo(c.expected.expectedTotal, 2);
      expect(r.computation.paidTotal).toBeCloseTo(c.expected.paidTotal, 2);
      expect(r.computation.shortfall).toBeCloseTo(c.expected.shortfall, 2);
      const mw = r.computation.lines.map((l) => l.baseRate);
      expect(Math.max(...mw)).toBeGreaterThanOrEqual(c.expected.minWageUsed);
      const mwRule = r.rules.find((x) => x.key.endsWith("min_wage_hourly") && x.value === c.expected.minWageUsed);
      expect(mwRule).toBeTruthy();
      if (c.expected.minWagePending) expect(mwRule!.status).toBe("pending_approval");
      for (const d of c.expected.holidayDates || []) expect(r.shifts.find((s) => s.date === d)?.dayType).toBe("holiday");
      const usedKeys = new Set(r.computation.lines.flatMap((l) => l.ruleKeys));
      for (const k of c.expected.ruleKeys || []) expect(usedKeys.has(k), `rule ${k} used`).toBe(true);
      expect(r.computation.problems.filter((p) => p.kind === "missing_rule")).toEqual([]);
      for (const rule of r.rules) {
        expect(rule.citations.length).toBeGreaterThan(0);
        expect(rule.citations.every((x) => x.verified)).toBe(true);
      }
      // the demo agent records rules through the tools, not only via code fallback
      expect(r.rules.some((x) => x.recordedBy === "agent")).toBe(true);
      expect(r.stoppedEarly).toBeUndefined();
    });
  }
});
