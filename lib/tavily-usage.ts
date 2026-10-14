// Account-wide Tavily guard. The daily caps in lib/budget.ts are kept in
// memory per server instance, so on their own several warm instances could
// spend more than one cap. Before a live check, this asks Tavily's usage API
// (GET https://api.tavily.com/usage, no credits) how many plan credits the
// account has used this month, and stops live checks at APP_TAVILY_MONTHLY_STOP
// (default 1000 of the 1,500-credit plan). The answer is cached for two
// minutes per instance. If the usage API cannot be reached the check goes
// ahead and the per-instance daily cap still applies.

const TTL_MS = 120_000;
let cache: { at: number; used: number } | undefined;

export function tavilyMonthlyStop(): number {
  const v = Number(process.env.APP_TAVILY_MONTHLY_STOP);
  return Number.isFinite(v) && v > 0 ? v : 1000;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Plan credits used this month, or undefined when unknown. */
export async function tavilyUsedThisMonth(fetchImpl: FetchLike = fetch, now = Date.now()): Promise<number | undefined> {
  if (cache && now - cache.at < TTL_MS) return cache.used;
  const key = process.env.TAVILY_API_KEY;
  if (!key) return undefined;
  try {
    const res = await fetchImpl("https://api.tavily.com/usage", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return undefined;
    const j = (await res.json()) as { account?: { plan_usage?: number }; key?: { usage?: number } };
    const used = j.account?.plan_usage ?? j.key?.usage;
    if (typeof used !== "number") return undefined;
    cache = { at: now, used };
    return used;
  } catch {
    return undefined;
  }
}

/** False once the account has used the monthly stop. Unknown usage counts as fine. */
export async function tavilyMonthlyOk(fetchImpl?: FetchLike): Promise<boolean> {
  const used = await tavilyUsedThisMonth(fetchImpl);
  return used === undefined || used < tavilyMonthlyStop();
}

/** Test helper. */
export function _resetTavilyUsage() {
  cache = undefined;
}
