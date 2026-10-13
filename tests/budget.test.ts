import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _resetBudget, admit, recordSpend } from "../lib/budget";

const saved = { ...process.env };
beforeEach(() => _resetBudget());
afterEach(() => {
  process.env = { ...saved };
});

describe("demo caps", () => {
  it("limits runs per visitor per hour", () => {
    process.env.APP_PER_IP_PER_HOUR = "2";
    const now = new Date("2026-10-20T10:00:00Z");
    expect(admit("1.1.1.1", now).ok).toBe(true);
    expect(admit("1.1.1.1", now).ok).toBe(true);
    expect(admit("1.1.1.1", now).ok).toBe(false);
    expect(admit("2.2.2.2", now).ok).toBe(true);
    expect(admit("1.1.1.1", new Date("2026-10-20T11:00:01Z")).ok).toBe(true);
  });
  it("stops everyone once the daily model budget is spent", () => {
    process.env.APP_GLOBAL_USD_PER_DAY = "1";
    expect(admit("3.3.3.3").ok).toBe(true);
    recordSpend(1.01, 0);
    expect(admit("4.4.4.4").ok).toBe(false);
  });
  it("stops everyone once the daily search budget is spent", () => {
    process.env.APP_GLOBAL_TAVILY_CREDITS_PER_DAY = "5";
    recordSpend(0, 5);
    expect(admit("5.5.5.5").ok).toBe(false);
  });
});
