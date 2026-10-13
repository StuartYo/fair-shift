import { describe, expect, it } from "vitest";
import { NebiusProvider } from "../lib/llm/nebius";

function fakeClient(behaviour: Record<string, () => unknown>) {
  const seen: string[] = [];
  const client = {
    chat: {
      completions: {
        create: async (body: never) => {
          const model = (body as { model: string }).model;
          seen.push(model);
          return behaviour[model]();
        },
      },
    },
  };
  return { seen, client };
}

const ok = (content: string) => () => ({
  choices: [{ message: { content, tool_calls: [{ id: "c1", type: "function", function: { name: "finish", arguments: "{}" } }] } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
});
const fail = (status: number) => () => {
  throw Object.assign(new Error(`HTTP ${status}`), { status });
};

describe("NebiusProvider fallback", () => {
  it("moves to the next model when one is unavailable", async () => {
    const f = fakeClient({ a: fail(404), b: ok("hi"), c: ok("never") });
    const p = new NebiusProvider(undefined, f.client);
    const r = await p.chat(["a", "b", "c"], [{ role: "user", content: "x" }]);
    expect(r.model).toBe("b");
    expect(f.seen).toEqual(["a", "b"]);
    expect(r.message.tool_calls?.[0].function.name).toBe("finish");
    expect(r.promptTokens).toBe(10);
    expect(p.fallbacks[0]).toEqual({ from: "a", reason: "HTTP 404" });
  });
  it("stops at once on 402 (out of credits) instead of trying pricier models", async () => {
    const f = fakeClient({ a: fail(402), b: ok("hi") });
    const p = new NebiusProvider(undefined, f.client);
    await expect(p.chat(["a", "b"], [{ role: "user", content: "x" }])).rejects.toThrow();
    expect(f.seen).toEqual(["a"]);
  });
  it("throws when every model fails", async () => {
    const f = fakeClient({ a: fail(500), b: fail(503) });
    const p = new NebiusProvider(undefined, f.client);
    await expect(p.chat(["a", "b"], [{ role: "user", content: "x" }])).rejects.toThrow();
  });
  it("refuses to start without a key", () => {
    const saved = process.env.NEBIUS_API_KEY;
    delete process.env.NEBIUS_API_KEY;
    expect(() => new NebiusProvider()).toThrow(/NEBIUS_API_KEY/);
    if (saved) process.env.NEBIUS_API_KEY = saved;
  });
});
