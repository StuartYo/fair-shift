import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NY_COURT_CHECKS, NY_NOT_USED } from "../eval/realworld/courts-ny";
import { TW_COURT_CHECKS, TW_NOT_USED } from "../eval/realworld/courts-tw";
import { POST_CASES } from "../eval/realworld/posts";

// Integrity of the real-world eval set. No network, no Fair Shift run.

const courts = [...TW_COURT_CHECKS, ...NY_COURT_CHECKS];

describe("real-world eval set", () => {
  it("has unique ids", () => {
    const ids = [...courts.map((c) => c.id), ...POST_CASES.map((p) => p.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cites every court figure to a public judgment", () => {
    for (const c of courts) {
      expect(c.source.url).toMatch(/^https:\/\/(judgment\.judicial\.gov\.tw\/FJUD\/data\.aspx\?ty=JD&id=|www\.govinfo\.gov\/content\/pkg\/USCOURTS-)/);
      expect(c.court.figure).toBeGreaterThan(0);
      expect(c.court.components.length).toBeGreaterThan(10);
      expect(c.court.excluded.length).toBeGreaterThan(3);
      expect(c.input.scheduleText.length).toBeLessThanOrEqual(4000);
      expect(c.input.jurisdiction === "TW" ? "TWD" : "USD").toBeTruthy();
    }
    for (const n of [...TW_NOT_USED, ...NY_NOT_USED]) expect(n.reason.length).toBeGreaterThan(5);
  });

  it("keeps post sources out of the repo and strips identifying details", () => {
    for (const p of POST_CASES) {
      const text = p.scheduleText + "\n" + p.payslipText;
      expect(text).not.toMatch(/ptt\.cc|https?:|imgur|作者|看板|@|line ?id|\d{4}-?\d{3}-?\d{3}/i);
      if (p.expected.outcome === "shifts") for (const s of p.expected.shifts) expect(s.md).toMatch(/^\d{2}-\d{2}$/);
    }
    for (const f of ["eval/realworld/posts.ts", "eval/realworld/courts-tw.ts", "eval/realworld/courts-ny.ts"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/ptt\.cc/);
    }
    expect(readFileSync(".gitignore", "utf8")).toContain("eval/realworld/_sources_private.md");
  });
});
