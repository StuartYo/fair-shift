// Runtime configuration. Keys are only read from the environment and are never
// logged, returned to the client, or written to disk.

export type Tier = "nano" | "super" | "ultra";
export const TIER_ORDER: Tier[] = ["nano", "super", "ultra"];

// From https://docs.tokenfactory.nebius.com/quickstart (checked 2026-10-13).
export const NEBIUS_BASE_URL = process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1/";

// Model IDs from the Token Factory public catalog (checked 2026-10-13):
// https://tokenfactory.nebius.com/api/public/models_info
export const DEFAULT_MODELS: Record<Tier, string> = {
  nano: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  super: "nvidia/nemotron-3-super-120b-a12b",
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
};

export function modelFor(tier: Tier): string {
  const env = {
    nano: process.env.NEMOTRON_NANO_MODEL,
    super: process.env.NEMOTRON_SUPER_MODEL,
    ultra: process.env.NEMOTRON_ULTRA_MODEL,
  }[tier];
  return env?.trim() || DEFAULT_MODELS[tier];
}

/** Fallback chain starting at a tier: nano -> super -> ultra. */
export function modelChain(start: Tier = "nano"): string[] {
  return TIER_ORDER.slice(TIER_ORDER.indexOf(start)).map(modelFor);
}

/** USD per 1M tokens (input, output), from the public catalog on 2026-10-13. Used for cost caps. */
export const PRICES: Record<Tier, [number, number]> = {
  nano: [0.06, 0.24],
  super: [0.3, 0.9],
  ultra: [1.0, 3.0],
};

export function priceForModel(model: string): [number, number] {
  if (model.startsWith("mock/")) return [0, 0];
  for (const t of TIER_ORDER) if (modelFor(t) === model) return PRICES[t];
  return PRICES.ultra; // unknown model: assume the most expensive
}

export function tierFromEnv(name: string, fallback: Tier): Tier {
  const v = (process.env[name] || "").toLowerCase();
  return (TIER_ORDER as string[]).includes(v) ? (v as Tier) : fallback;
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Read lazily so tests and deployments can change env without a rebuild. */
export function limits() {
  return {
    maxInputChars: num("APP_MAX_INPUT_CHARS", 4000),
    maxAgentSteps: num("APP_MAX_AGENT_STEPS", 24),
    maxToolCallsPerStep: num("APP_MAX_TOOL_CALLS_PER_STEP", 6),
    maxTavilyCallsPerRun: num("APP_MAX_TAVILY_CALLS", 12),
    maxCompletionTokens: num("APP_MAX_COMPLETION_TOKENS", 1200),
    perRunUsd: num("APP_PER_RUN_USD", 0.05),
    perIpPerHour: num("APP_PER_IP_PER_HOUR", 6),
    perIpPerDay: num("APP_PER_IP_PER_DAY", 20),
    globalRunsPerDay: num("APP_GLOBAL_RUNS_PER_DAY", 300),
    globalUsdPerDay: num("APP_GLOBAL_USD_PER_DAY", 2),
    globalTavilyCreditsPerDay: num("APP_GLOBAL_TAVILY_CREDITS_PER_DAY", 300),
  };
}

export function hasNebiusKey(): boolean {
  return !!process.env.NEBIUS_API_KEY && process.env.APP_FORCE_MOCK !== "1";
}

export function hasTavilyKey(): boolean {
  return !!process.env.TAVILY_API_KEY && process.env.APP_FORCE_MOCK !== "1";
}

export type Mode = "live" | "mock";

/** Live only when both keys exist, so fixture citations never mix with real ones. */
export function currentMode(): Mode {
  return hasNebiusKey() && hasTavilyKey() ? "live" : "mock";
}

/**
 * Demo model with real retrieval: APP_LIVE_SEARCH=1 and a Tavily key, no model key
 * needed. The scripted model drives the same tools over pages Tavily retrieves
 * from the official sites. Used to test retrieval before model credits exist.
 */
export function liveSearchWithMockModel(): boolean {
  return currentMode() === "mock" && hasTavilyKey() && process.env.APP_LIVE_SEARCH === "1";
}

export function modeNote(mode: Mode = currentMode()): string {
  if (mode === "live") return "Live: Nemotron on Nebius Token Factory, sources retrieved with Tavily.";
  if (liveSearchWithMockModel())
    return "Demo model, live sources (APP_LIVE_SEARCH=1): a scripted stand-in for the model runs the same tools and checks over official pages retrieved with Tavily during the run. The math and the quote checks are the real code.";
  const what =
    "a scripted stand-in for the model runs the same tools and checks over saved copies of the official pages (recorded 2026-10-13 and 2026-10-14). The math and the quote checks are the real code.";
  if (process.env.APP_FORCE_MOCK === "1") return `Demo mode (APP_FORCE_MOCK=1): ${what}`;
  const missing = [!process.env.NEBIUS_API_KEY && "NEBIUS_API_KEY", !process.env.TAVILY_API_KEY && "TAVILY_API_KEY"]
    .filter(Boolean)
    .join(" and ");
  return `Demo mode (no ${missing} yet): ${what} Live mode uses Nemotron on Nebius Token Factory and Tavily search.`;
}
