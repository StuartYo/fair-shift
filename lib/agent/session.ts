import { limits, modelChain, priceForModel, type Tier } from "../config";
import { isAllowedUrl } from "../domains";
import type { ChatMessage, ChatProvider, ToolCall, ToolSchema } from "../llm/provider";
import type { SearchProvider } from "../search/provider";
import { emptyUsage, type Citation, type RetrievedDoc, type TraceStep, type Usage } from "../types";
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
  /** Output token budget per model turn. Reasoning models need room to think before the tool call. */
  maxTokens?: number;
  /**
   * Checked after each turn's tool calls. True = the task is complete, so the
   * loop ends without spending another model turn on "finish".
   */
  isDone?: () => boolean;
  /** Epoch ms. No new model turn starts after this; code fallback takes over. */
  deadlineAt?: number;
  /** false = ask the model to answer without a thinking phase (faster tool calls). Default: provider default. */
  reasoning?: boolean;
  /** Shown in the trace when several loops run at once, e.g. "rates" and "law". */
  label?: string;
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

const VIEW_CHARS = 4000;

function focusTokens(s: string): string[] {
  const out = new Set<string>();
  const lower = s.toLowerCase();
  for (const w of lower.match(/[a-z0-9]{3,}/g) || []) out.add(w);
  const cjk = lower.replace(/[^㐀-鿿]/g, "");
  for (let i = 0; i < cjk.length - 1; i++) out.add(cjk.slice(i, i + 2));
  return [...out];
}

/**
 * What fetch_official shows the model. Short pages: the whole text. Long pages
 * (a whole law, a 40-page wage order): the start, or with `focus` the blocks
 * that best match it, in page order. Every block is a verbatim slice, so quotes
 * copied from it still verify against the full retrieved page.
 */
export function pageView(content: string, focus: string): { text: string; note?: string } {
  if (content.length <= VIEW_CHARS) return { text: content };
  const toks = focusTokens(focus);
  const start = { text: content.slice(0, VIEW_CHARS) };
  if (toks.length === 0)
    return { ...start, note: `Page has ${content.length} characters; showing the start. Call fetch_official again with focus to see other parts.` };
  // Blocks of up to ~600 characters, cut at a line break where possible.
  const blocks: string[] = [];
  for (let i = 0; i < content.length; ) {
    let end = Math.min(content.length, i + 600);
    const nl = content.lastIndexOf("\n", end);
    if (end < content.length && nl > i + 200) end = nl;
    blocks.push(content.slice(i, end));
    i = end;
  }
  const scored = blocks
    .map((b, idx) => ({ idx, s: toks.reduce((a, t) => a + (b.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.idx - b.idx);
  const pick = new Set<number>();
  let used = 0;
  for (const { idx } of scored) {
    // The best block and the one after it, so a clause cut at a block edge stays whole.
    for (const j of [idx, idx + 1]) {
      if (j >= blocks.length || pick.has(j) || used + blocks[j].length > VIEW_CHARS) continue;
      pick.add(j);
      used += blocks[j].length;
    }
    if (used > VIEW_CHARS - 300) break;
  }
  if (pick.size === 0) return { ...start, note: `Nothing on this ${content.length}-character page matched the focus; showing the start.` };
  let text = "";
  let last = -2;
  for (const j of [...pick].sort((a, b) => a - b)) {
    if (text && j !== last + 1) text += "\n[...]\n";
    text += blocks[j];
    last = j;
  }
  return { text, note: `Page has ${content.length} characters; showing the parts that match the focus. [...] marks text left out.` };
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
  /** Extracts in flight, so a prefetch and the agent's fetch of the same URL share one request. */
  private inflight = new Map<string, Promise<RetrievedDoc | null>>();
  /** Every search this run made, with its results, for the report. */
  readonly searches: { query: string; domains: string[]; hits: { url: string; title: string }[] }[] = [];

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
  async chatJson(system: string, user: string, tier: Tier = "nano", maxTokens = 500, reasoning = true): Promise<Record<string, unknown>> {
    if (this.overBudget()) return {};
    try {
      const r = await this.llm.chat(
        modelChain(tier),
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { jsonMode: true, maxTokens, temperature: 0, reasoning },
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
        foundBy: "search",
      });
    this.searches.push({ query, domains: domains ?? [], hits: hits.map((h) => ({ url: h.url, title: h.title })) });
    this.emit({
      kind: "tool",
      name: "search_official",
      detail: `"${query.slice(0, 60)}" -> ${hits.length} result(s)`,
      detailZh: `搜尋「${query.slice(0, 40)}」，找到 ${hits.length} 筆`,
    });
    return hits;
  }

  /**
   * Full text of one allowlisted page. A page already retrieved in this run (or
   * being retrieved by a prefetch) is reused without another Tavily call.
   */
  async fetchOfficial(url: string, focus?: string, foundBy: "seed" | "search" = "seed"): Promise<RetrievedDoc | null> {
    if (!isAllowedUrl(url)) {
      this.emit({ kind: "guard", name: "domain_blocked", detail: `Refused non-official URL ${url.slice(0, 80)}`, detailZh: `拒絕非官方網址 ${url.slice(0, 80)}` });
      throw new Error("URL is not on the official domain allowlist");
    }
    // `focus` only picks which parts the model sees, see pageView().
    void focus;
    const have = this.docs.page(url);
    if (have) return have;
    const pending = this.inflight.get(url);
    if (pending) return pending;
    if (this.tavilyCalls >= limits().maxTavilyCallsPerRun) throw new Error("fetch budget for this run is used up");
    this.tavilyCalls++;
    const p = (async () => {
      const { doc, credits } = await this.search.extract(url);
      this.usage.tavilyCredits += credits;
      const out = doc ? { ...doc, foundBy } : null;
      if (out) this.docs.add(out);
      this.emit({
        kind: "tool",
        name: "fetch_official",
        detail: out ? `${out.title.slice(0, 60)} (${out.content.length} chars)${foundBy === "search" ? ", found by search" : ""}` : `${url.slice(0, 80)} -> no text`,
        detailZh: out ? `讀取官方網頁：${out.title.slice(0, 40)}（${out.content.length} 字）${foundBy === "search" ? "，由搜尋找到" : ""}` : `${url.slice(0, 80)} 讀不到內容`,
      });
      return out;
    })();
    this.inflight.set(url, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(url);
    }
  }

  /** Start retrieving pages before the agent asks for them. Failures are left for the agent to see. */
  prefetch(urls: string[]): Promise<void> {
    return Promise.all(urls.map((u) => this.fetchOfficial(u).catch(() => null))).then(() => undefined);
  }

  /** Seconds since the run started. */
  elapsedMs(): number {
    return Date.now() - this.t0;
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
          return JSON.stringify({ url: doc.url, title: doc.title, ...pageView(doc.content, a.focus ? String(a.focus) : "") });
        }
        const tool = o.tools.find((t) => t.schema.function.name === name);
        if (!tool) throw new Error(`unknown tool ${name}`);
        const out = await tool.handler(a, ctx);
        const o2 = (typeof out === "object" && out ? out : {}) as { detail?: unknown; detailZh?: unknown };
        this.emit({ kind: "tool", name, detail: o2.detail !== undefined ? String(o2.detail).slice(0, 120) : "ok", detailZh: o2.detailZh !== undefined ? String(o2.detailZh).slice(0, 120) : undefined });
        return JSON.stringify(out ?? { ok: true });
      } catch (e) {
        this.emit({ kind: "guard", name: `${name}_error`, detail: (e as Error).message.slice(0, 120) });
        return JSON.stringify({ error: (e as Error).message });
      }
    };

    let nudges = 0;
    const maxSteps = o.maxSteps ?? L.maxAgentSteps;
    let step = 0;
    for (; step < maxSteps && !finished; step++) {
      if (o.deadlineAt && Date.now() > o.deadlineAt) {
        stoppedEarly = "Time limit for the agent reached.";
        this.emit({ kind: "guard", name: "time_stop", detail: stoppedEarly, detailZh: "代理的時間用完了，剩下的由程式從已取得的原文補上。" });
        break;
      }
      if (this.overBudget()) {
        stoppedEarly = "Per-run model budget reached.";
        this.emit({ kind: "guard", name: "budget_stop", detail: stoppedEarly });
        break;
      }
      let res;
      try {
        res = await this.llm.chat(chain, messages, { tools: schemas, maxTokens: o.maxTokens ?? L.maxCompletionTokens, temperature: 0, reasoning: o.reasoning });
      } catch (e) {
        stoppedEarly = `Model call failed: ${(e as Error).message.slice(0, 120)}`;
        this.emit({ kind: "guard", name: "model_error", detail: stoppedEarly });
        break;
      }
      this.account(res.model, res.promptTokens, res.completionTokens);
      const calls = (res.message.tool_calls || []).slice(0, L.maxToolCallsPerStep);
      const cutOff = res.finishReason === "length";
      this.emit({
        kind: "model",
        name: "agent",
        model: res.model,
        detail:
          (o.label ? `[${o.label}] ` : "") +
          (calls.length ? `requested ${calls.map((c) => c.function.name).join(", ")}` : cutOff ? "ran out of output tokens before calling a tool" : "replied without tools"),
        detailZh:
          (o.label ? `［${o.label === "rates" ? "費率與假日" : o.label === "law" ? "法條" : o.label}］` : "") +
          (calls.length ? `代理呼叫 ${calls.map((c) => c.function.name).join("、")}` : cutOff ? "代理還沒呼叫工具就用完輸出長度" : "代理沒有呼叫工具"),
      });
      messages.push({ role: "assistant", content: res.message.content ?? null, tool_calls: calls.length ? calls : undefined });
      if (calls.length === 0) {
        if (nudges >= 2) {
          stoppedEarly = "The model stopped calling tools.";
          this.emit({ kind: "guard", name: "no_tool_calls", detail: stoppedEarly });
          break;
        }
        nudges++;
        messages.push({
          role: "user",
          content: cutOff
            ? "Your reply was cut off before any tool call. Keep your reasoning short and make the tool calls now."
            : "Use the tools to complete the task, then call finish.",
        });
        continue;
      }
      // Retrieval calls run in parallel; app tools run in order; finish runs last.
      // Every call gets a tool message, in the order the model made them.
      const results = new Map<string, string>();
      const retrieval = calls.filter((c) => builtin && (c.function.name === "fetch_official" || c.function.name === "search_official"));
      await Promise.all(retrieval.map(async (c) => results.set(c.id, await exec(c))));
      for (const c of calls) if (!results.has(c.id) && c.function.name !== "finish") results.set(c.id, await exec(c));
      for (const c of calls) if (!results.has(c.id)) results.set(c.id, await exec(c));
      for (const c of calls) messages.push({ role: "tool", tool_call_id: c.id, content: results.get(c.id)! });
      if (!finished && o.isDone?.()) {
        finished = true;
        finishSummary = "complete";
        this.emit({
          kind: "info",
          name: "auto_finish",
          detail: `${o.label ? `[${o.label}] ` : ""}Every rule is recorded and checked, so the loop ends without another model turn.`,
          detailZh: "這一組規定都已記錄並通過檢查，不用再多跑一輪模型。",
        });
      }
    }
    if (!finished && !stoppedEarly && step >= maxSteps) {
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
