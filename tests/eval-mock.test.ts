import { describe, expect, it } from "vitest";
import { EVAL_CASES } from "../eval/cases";
import { HELDOUT_CASES } from "../eval/heldout";
import { REALSTYLE_CASES } from "../eval/realstyle";
import fixtures from "../fixtures/official-pages.json";
import { MockProvider } from "../lib/llm/mock";
import { FixtureSearchProvider, type FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { shiftCount } from "../lib/wage/compute";
import { runFairShift } from "../lib/wage/run";
import { ROUND3_CASES } from "../eval/round3";
import { flagsOf } from "../lib/wage/run";

// Full pipeline in demo mode: scripted agent + recorded official pages.
// Checks that every eval case comes out exactly as hand-computed, and that every
// rule used carries a verified citation.

describe("eval cases through the full pipeline (demo mode)", () => {
  for (const c of [...EVAL_CASES, ...HELDOUT_CASES, ...REALSTYLE_CASES, ...ROUND3_CASES]) {
    it(`${c.id}: ${c.title}`, async () => {
      const r = await runFairShift(c.input, {
        llm: new MockProvider(rulesMockScript()),
        search: new FixtureSearchProvider(fixtures as FixtureSet),
        mode: "mock",
        modeNote: "test",
        today: "2026-10-13",
      });
      if (c.expected.needsInput) {
        // The right answer is to ask: no amount, no agent, no model or search spend.
        expect(r.needsInput?.kind).toBe(c.expected.needsInput);
        expect(r.computation.lines).toEqual([]);
        expect(r.computation.shortfall).toBeUndefined();
        expect(r.trace.some((t) => t.name === "agent")).toBe(false);
        return;
      }
      expect(r.needsInput).toBeUndefined();
      expect(shiftCount(r.shifts)).toBe(c.expected.shifts);
      if (c.expected.flags) expect(flagsOf(r).sort()).toEqual([...c.expected.flags].sort());
      expect(r.computation.workedHours).toBe(c.expected.workedHours);
      expect(r.computation.expectedTotal).toBeCloseTo(c.expected.expectedTotal, 2);
      expect(r.computation.paidTotal).toBeCloseTo(c.expected.paidTotal, 2);
      expect(r.computation.shortfall).toBeCloseTo(c.expected.shortfall, 2);
      const mw = r.computation.lines.map((l) => l.baseRate);
      expect(Math.max(...mw)).toBeGreaterThanOrEqual(c.expected.minWageUsed);
      const mwRule = r.rules.find((x) => x.key.endsWith("min_wage_hourly") && x.value === c.expected.minWageUsed);
      expect(mwRule).toBeTruthy();
      // Decided but not yet formally announced: pending, or (when search finds the cabinet's release) cabinet_announced.
      if (c.expected.minWagePending) expect(["pending_approval", "cabinet_announced"]).toContain(mwRule!.status);
      for (const d of c.expected.holidayDates || []) expect(r.shifts.find((s) => s.date === d)?.dayType).toBe("holiday");
      const usedKeys = new Set(r.computation.lines.flatMap((l) => l.ruleKeys));
      for (const k of c.expected.ruleKeys || []) expect(usedKeys.has(k), `rule ${k} used`).toBe(true);
      expect(r.computation.problems.filter((p) => p.kind === "missing_rule")).toEqual([]);
      for (const rule of r.rules) {
        expect(rule.citations.length).toBeGreaterThan(0);
        expect(rule.citations.every((x) => x.verified)).toBe(true);
      }
      // the demo agent records every rule and holiday through the tools; code fallback is not needed
      expect(r.recordedBy.fallbackRules + r.recordedBy.fallbackHolidays).toBe(0);
      expect(r.parseError).toBeUndefined();
      expect(r.stoppedEarly).toBeUndefined();
    });
  }
});
