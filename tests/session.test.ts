import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentSession, type AppTool } from "../lib/agent/session";
import { MockProvider, playActions } from "../lib/llm/mock";
import type { ChatProvider } from "../lib/llm/provider";
import { FixtureSearchProvider, type FixtureSet } from "../lib/search/fixture";
import type { Citation } from "../lib/types";

// Synthetic test data only. Not a real rule and not a real page.
const URL_A = "https://rules.example.gov/test-rule-a";
const FIXTURES: FixtureSet = {
  _note: "Synthetic test fixture. Not real rule text.",
  recordedOn: "2026-10-13",
  docs: [
    { url: URL_A, title: "Test rule A", content: "Section 1. Overtime hours must be paid at the higher rate. Section 2. Records must be kept." },
    { url: "https://rules.example.gov/other", title: "Unrelated page", content: "Parking permits are issued monthly." },
  ],
};

const saved = { ...process.env };
beforeEach(() => {
  process.env.APP_ALLOWED_DOMAINS = "example.gov";
});
afterEach(() => {
  process.env = { ...saved };
});

/** App tool used by the tests: records a claim only with a verified citation. */
function recordTool(store: { cits: Citation[]; rejected: string[] }): AppTool {
  return {
    schema: {
      type: "function",
      function: {
        name: "record_finding",
        description: "Record a finding with a verbatim quote.",
        parameters: {
          type: "object",
          properties: { source_url: { type: "string" }, quote: { type: "string" } },
          required: ["source_url", "quote"],
        },
      },
    },
    handler(args, ctx) {
      const v = ctx.verifyCitation(String(args.source_url), String(args.quote));
      if (!v.ok) {
        store.rejected.push(v.reason);
        throw new Error(v.reason);
      }
      store.cits.push(v.citation);
      return { ok: true, detail: "recorded" };
    },
  };
}

function session(llm: ChatProvider) {
  return new AgentSession({ llm, search: new FixtureSearchProvider(FIXTURES) });
}

describe("agent loop", () => {
  it("runs search -> fetch -> app tool -> finish and only accepts retrieved quotes", async () => {
    const store = { cits: [] as Citation[], rejected: [] as string[] };
    const llm = new MockProvider(
      playActions([
        { tool: "search_official", args: { query: "overtime higher rate" } },
        { tool: "fetch_official", args: { url: URL_A } },
        { tool: "record_finding", args: { source_url: URL_A, quote: "I made this rule up." } },
        { tool: "record_finding", args: { source_url: URL_A, quote: "Overtime hours must be paid at the higher rate." } },
        { tool: "finish", args: { summary: "ok" } },
      ]),
    );
    const s = session(llm);
    const r = await s.runLoop({ systemPrompt: "sys", userContent: "task", tools: [recordTool(store)] });
    expect(r.finished).toBe(true);
    expect(store.cits).toHaveLength(1);
    expect(store.cits[0].via).toBe("fixture_extract");
    expect(store.rejected).toHaveLength(1);
    const sum = s.summary();
    expect(sum.retrieved.some((d) => d.url === URL_A)).toBe(true);
    expect(sum.usage.toolCalls).toBe(5);
    expect(sum.trace.some((t) => t.name === "record_finding_error")).toBe(true);
  });

  it("refuses to fetch a URL outside the allowlist", async () => {
    const llm = new MockProvider(
      playActions([
        { tool: "fetch_official", args: { url: "https://evil.example.com/rule" } },
        { tool: "finish", args: { summary: "x" } },
      ]),
    );
    const s = session(llm);
    const r = await s.runLoop({ systemPrompt: "s", userContent: "u", tools: [] });
    expect(r.finished).toBe(true);
    expect(s.trace.some((t) => t.name === "domain_blocked")).toBe(true);
    expect(s.docs.all()).toHaveLength(0);
  });

  it("stops at the step limit", async () => {
    const llm = new MockProvider(() => ({ tool: "search_official", args: { query: "parking" } }));
    const s = session(llm);
    const r = await s.runLoop({ systemPrompt: "s", userContent: "u", tools: [], maxSteps: 3 });
    expect(r.finished).toBe(false);
    expect(r.stoppedEarly).toMatch(/step limit/);
  });

  it("caps searches per run", async () => {
    process.env.APP_MAX_TAVILY_CALLS = "2";
    const llm = new MockProvider(() => ({ tool: "search_official", args: { query: "parking" } }));
    const s = session(llm);
    await s.runLoop({ systemPrompt: "s", userContent: "u", tools: [], maxSteps: 4 });
    expect(s.trace.filter((t) => t.name === "search_official").length).toBe(2);
    expect(s.trace.some((t) => t.name === "search_official_error")).toBe(true);
  });

  it("stops when the per-run cost cap is reached", async () => {
    process.env.APP_PER_RUN_USD = "0.001";
    const pricey: ChatProvider = {
      kind: "mock",
      async chat() {
        return {
          message: { content: null, tool_calls: [{ id: "x", type: "function", function: { name: "search_official", arguments: '{"query":"a"}' } }] },
          model: "vendor/unknown-priced-as-ultra",
          promptTokens: 2000,
          completionTokens: 0,
        };
      },
    };
    const s = session(pricey);
    const r = await s.runLoop({ systemPrompt: "s", userContent: "u", tools: [] });
    expect(r.stoppedEarly).toMatch(/budget/);
    expect(s.usage.modelCalls).toBe(1);
  });

  it("rejects app tools that reuse built-in names", async () => {
    const s = session(new MockProvider());
    const bad: AppTool = {
      schema: { type: "function", function: { name: "finish", description: "", parameters: {} } },
      handler: () => ({}),
    };
    await expect(s.runLoop({ systemPrompt: "s", userContent: "u", tools: [bad] })).rejects.toThrow(/reserved/);
  });

  it("chatJson returns {} on bad JSON instead of throwing", async () => {
    const s = session(new MockProvider(() => ({ text: "not json" })));
    expect(await s.chatJson("s", "u")).toEqual({});
  });
});
