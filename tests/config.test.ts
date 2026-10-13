import { afterEach, describe, expect, it } from "vitest";
import { currentMode, DEFAULT_MODELS, modeNote, modelChain, priceForModel } from "../lib/config";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("model chain", () => {
  it("falls back nano -> super -> ultra", () => {
    expect(modelChain("nano")).toEqual([DEFAULT_MODELS.nano, DEFAULT_MODELS.super, DEFAULT_MODELS.ultra]);
    expect(modelChain("super")).toEqual([DEFAULT_MODELS.super, DEFAULT_MODELS.ultra]);
  });
  it("reads model IDs from env", () => {
    process.env.NEMOTRON_SUPER_MODEL = "nvidia/some-new-super";
    expect(modelChain("super")[0]).toBe("nvidia/some-new-super");
    expect(priceForModel("nvidia/some-new-super")).toEqual([0.3, 0.9]);
  });
  it("prices unknown models as the most expensive tier", () => {
    expect(priceForModel("vendor/unknown")).toEqual([1, 3]);
  });
});

describe("mode switch", () => {
  it("is mock when a key is missing, and names the missing key without printing values", () => {
    delete process.env.APP_FORCE_MOCK;
    process.env.NEBIUS_API_KEY = "sk-test-not-real";
    delete process.env.TAVILY_API_KEY;
    expect(currentMode()).toBe("mock");
    expect(modeNote()).toContain("TAVILY_API_KEY");
    expect(modeNote()).not.toContain("sk-test-not-real");
  });
  it("is live when both keys exist", () => {
    delete process.env.APP_FORCE_MOCK;
    process.env.NEBIUS_API_KEY = "a";
    process.env.TAVILY_API_KEY = "b";
    expect(currentMode()).toBe("live");
  });
  it("APP_FORCE_MOCK=1 wins over keys", () => {
    process.env.NEBIUS_API_KEY = "a";
    process.env.TAVILY_API_KEY = "b";
    process.env.APP_FORCE_MOCK = "1";
    expect(currentMode()).toBe("mock");
  });
});
