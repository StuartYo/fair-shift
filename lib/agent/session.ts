import { limits, modelChain, priceForModel, type Tier } from "../config";
import { isAllowedUrl } from "../domains";
import type { ChatMessage, ChatProvider, ToolCall, ToolSchema } from "../llm/provider";
import type { SearchProvider } from "../search/provider";
import { emptyUsage, type Citation, type TraceStep, type Usage } from "../types";
import { DocStore } from "./citations";

// Domain-independent agent core.
// - Built-in tools: search_official, fetch_official, finish.
// - Apps register their own tools (e.g. "record a finding", "compute a result").
// - Every retrieved document lands in a DocStore, so any quote shown to a user
//   can be checked verbatim against what was actually retrieved in this run.
// - Cost, step and search caps are enforced here, not in the prompt.

export interface ToolContext {
  session: AgentSession;
  /** Verify a quote against text retrieved in this run. */
  verifyCitation(url: string, quote: string): { ok: true; citation: Citation } | { ok: false; reason: string };
}

export interface AppTool {
  schema: ToolSchema;
  /** Return any JSON-serialisable value; it is sent back to the model. Throwing returns an error message. */
  handler(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> | unknown;
}

export interface SessionOptions {
  llm: ChatProvider;
  search: SearchProvider;
  onEvent?: (step: TraceStep) => void;
}

export interface LoopOptions {
  systemPrompt: string;
  userContent: string;
  tools: AppTool[];
  startTier?: Tier;
  /** Include search_official / fetch_official. Default true. */
  builtinRetrieval?: boolean;
  maxSteps?: number;
}

export interface LoopResult {
  finished: boolean;
  finishSummary?: string;
  stoppedEarly?: string;
  messages: ChatMessage[];
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export const BUILTIN_SCHEMAS: Record<"search_official" | "fetch_official" | "finish", ToolSchema> = {
  search_official: {
    type: "function",
    function: {
      name: "search_official",
      description:
        "Search official government sources only (the domain allowlist is enforced by code). Returns titles, URLs and snippets. Snippets count as retrieved text and may be quoted.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          domains: { type: "array", items: { type: "string" }, description: "Optional: narrow to some allowlisted domains." },
        },
        required: ["query"],
      },
    },
  },
  fetch_official: {
    type: "function",
    function: {
      name: "fetch_official",
      description: "Fetch the text of one allowlisted official page before quoting it. Returns the most relevant parts.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" }, focus: { type: "string", description: "What to look for on the page." } },
        required: ["url"],
      },
    },
  },
  finish: {
    type: "function",
    function: {
      name: "finish",
      description: "Call once the task is complete.",
      parameters: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
    },
  },
};

export class AgentSession {
  readonly docs = new DocStore();
  readonly trace: TraceStep[] = [];
  readonly usage: Usage = emptyUsage();
  readonly modelsUsed = new Set<string>();
  private t0 = Date.now();
  private tavilyCalls = 0;

  constructor(private opts: SessionOptions) {}

  get llm() {
    return this.opts.llm;
  }
  get search() {
    return this.opts.search;
  }

  emit(s: Omit<TraceStep, "t">) {
    const step = { ...s, t: Date.now() - this.t0 };
    this.trace.push(step);
    this.opts.onEvent?.(step);
  }

  private account(model: string, p: number, c: number) {
    this.usage.promptTokens += p;
    this.usage.completionTokens += c;
    const [pin, pout] = priceForModel(model);
    this.usage.estCostUsd += (p * pin + c * pout) / 1_000_000;
    this.usage.modelCalls++;
    this.modelsUsed.add(model);
  }

  overBudget(): boolean {
    return this.usage.estCostUsd >= limits().perRunUsd;
  }

  /** One JSON-mode call, e.g. cheap triage on the Nano tier. Returns {} on any failure. */
  async chatJson(system: string, user: string, tier: Tier = "nano", maxTokens = 500): Promise<Record<string, unknown>> {
    if (this.overBudget()) return {};
    try {
      const r = await this.llm.chat(
        modelChain(tier),
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { jsonMode: true, maxTokens, temperature: 0 },
      );
      this.account(r.model, r.promptTokens, r.completionTokens);
      this.emit({ kind: "model", name: "json", model: r.model, detail: `${r.completionTokens} output tokens` });
      return parseArgs((r.message.content || "").trim().replace(/^```(?:json)?/, "").replace(/```$/, ""));
    } catch (e) {
      this.emit({ kind: "guard", name: "json_failed", detail: (e as Error).message.slice(0, 100) });
      return {};
    }
  }

  /** Retrieval with the per-run search cap. Used by built-in tools and by app code. */
  async searchOfficial(query: string, domains?: string[]) {
    if (this.tavilyCalls >= limits().maxTavilyCallsPerRun) throw new Error("search budget for this run is used up");
    this.tavilyCalls++;
    const { hits, credits } = await this.search.search(query, domains);
    this.usage.tavilyCredits += credits;
    for (const h of hits)
      this.docs.add({
        url: h.url,
        title: h.title,
        content: h.snippet,
        via: this.search.kind === "tavily" ? "tavily_search" : "fixture_search",
        retrievedAt: new Date().toISOString(),
      });
    this.emit({ kind: "tool", name: "search_official", detail: `"${query.slice(0, 60)}" -> ${hits.length} result(s)` });
    return hits;
  }

  async fetchOfficial(url: string, focus?: string) {
    if (!isAllowedUrl(url)) {
      this.emit({ kind: "guard", name: "domain_blocked", detail: `Refused non-official URL ${url.slice(0, 80)}` });
      throw new Error("URL is not on the official domain allowlist");
    }
    if (this.tavilyCalls >= limits().maxTavilyCallsPerRun) throw new Error("fetch budget for this run is used up");
    this.tavilyCalls++;
    const { doc, credits } = await this.search.extract(url, focus);
    this.usage.tavilyCredits += credits;
    if (doc) this.docs.add(doc);
    this.emit({ kind: "tool", name: "fetch_official", detail: doc ? `${doc.title.slice(0, 60)} (${doc.content.length} chars)` : `${url.slice(0, 80)} -> no text` });
    return doc;
  }

  /** Tool-calling loop on the model chain starting at startTier (default super). */
  async runLoop(o: LoopOptions): Promise<LoopResult> {
    const L = limits();
    const builtin = o.builtinRetrieval !== false;
    const appNames = new Set(o.tools.map((t) => t.schema.function.name));
    for (const n of ["search_official", "fetch_official", "finish"]) {
      if (appNames.has(n)) throw new Error(`tool name ${n} is reserved`);
    }
    const schemas: ToolSchema[] = [
      ...(builtin ? [BUILTIN_SCHEMAS.search_official, BUILTIN_SCHEMAS.fetch_official] : []),
      ...o.tools.map((t) => t.schema),
      BUILTIN_SCHEMAS.finish,
    ];
    const ctx: ToolContext = { session: this, verifyCitation: (u, q) => this.docs.verify(u, q) };
    const messages: ChatMessage[] = [
      { role: "system", content: o.systemPrompt },
      { role: "user", content: o.userContent },
    ];
    const chain = modelChain(o.startTier ?? "super");
    let finished = false;
    let finishSummary: string | undefined;
    let stoppedEarly: string | undefined;
    let nudged = false;

    const exec = async (call: ToolCall): Promise<string> => {
      this.usage.toolCalls++;
      const name = call.function.name;
      const a = parseArgs(call.function.arguments);
      try {
        if (name === "finish") {
          finished = true;
          finishSummary = String(a.summary ?? "").slice(0, 1000);
          this.emit({ kind: "tool", name, detail: "finished" });
          return JSON.stringify({ ok: true });
        }
        if (builtin && name === "search_official") {
          const q = String(a.query ?? "").slice(0, 300);
          if (!q) throw new Error("query is required");
          const hits = await this.searchOfficial(q, Array.isArray(a.domains) ? a.domains.map(String) : undefined);
          return JSON.stringify({ results: hits.map((h) => ({ url: h.url, title: h.title, snippet: h.snippet.slice(0, 600) })) });
        }
        if (builtin && name === "fetch_official") {
          const doc = await this.fetchOfficial(String(a.url ?? ""), a.focus ? String(a.focus).slice(0, 200) : undefined);
          if (!doc) throw new Error("No text could be retrieved from this URL.");
          return JSON.stringify({ url: doc.url, title: doc.title, text: doc.content.slice(0, 4000) });
        }
        const tool = o.tools.find((t) => t.schema.function.name === name);
        if (!tool) throw new Error(`unknown tool ${name}`);
        const out = await tool.handler(a, ctx);
        this.emit({ kind: "tool", name, detail: typeof out === "object" && out && "detail" in out ? String((out as { detail: unknown }).detail).slice(0, 120) : "ok" });
        return JSON.stringify(out ?? { ok: true });
      } catch (e) {
        this.emit({ kind: "guard", name: `${name}_error`, detail: (e as Error).message.slice(0, 120) });
        return JSON.stringify({ error: (e as Error).message });
      }
    };

    for (let step = 0; step < (o.maxSteps ?? L.maxAgentSteps) && !finished; step++) {
      if (this.overBudget()) {
        stoppedEarly = "Per-run model budget reached.";
        this.emit({ kind: "guard", name: "budget_stop", detail: stoppedEarly });
        break;
      }
      let res;
      try {
        res = await this.llm.chat(chain, messages, { tools: schemas, maxTokens: L.maxCompletionTokens });
      } catch (e) {
        stoppedEarly = `Model call failed: ${(e as Error).message.slice(0, 120)}`;
        this.emit({ kind: "guard", name: "model_error", detail: stoppedEarly });
        break;
      }
      this.account(res.model, res.promptTokens, res.completionTokens);
      const calls = (res.message.tool_calls || []).slice(0, L.maxToolCallsPerStep);
      this.emit({
        kind: "model",
        name: "agent",
        model: res.model,
        detail: calls.length ? `requested ${calls.map((c) => c.function.name).join(", ")}` : "replied without tools",
      });
      messages.push({ role: "assistant", content: res.message.content ?? null, tool_calls: calls.length ? calls : undefined });
      if (calls.length === 0) {
        if (nudged) break;
        nudged = true;
        messages.push({ role: "user", content: "Use the tools to complete the task, then call finish." });
        continue;
      }
      for (const call of calls) {
        messages.push({ role: "tool", tool_call_id: call.id, content: await exec(call) });
        if (finished) break;
      }
    }
    if (!finished && !stoppedEarly) {
      stoppedEarly = "Agent step limit reached.";
      this.emit({ kind: "guard", name: "step_limit", detail: stoppedEarly });
    }
    return { finished, finishSummary, stoppedEarly, messages };
  }

  summary() {
    return {
      trace: this.trace,
      usage: { ...this.usage, estCostUsd: +this.usage.estCostUsd.toFixed(6), tavilyCredits: +this.usage.tavilyCredits.toFixed(2) },
      modelsUsed: [...this.modelsUsed],
      retrieved: this.docs.all().map((d) => ({ url: d.url, title: d.title, via: d.via })),
    };
  }
}
