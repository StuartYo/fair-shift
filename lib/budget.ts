import { limits } from "./config";

// Public-demo caps. In-memory per server instance: good enough for a hackathon
// demo on one Vercel region. Each instance also enforces the global daily USD
// and Tavily caps, so the worst case is (instances x cap). Documented in README.

interface Bucket {
  hour: number;
  hourCount: number;
  day: string;
  dayCount: number;
}

const ipBuckets = new Map<string, Bucket>();
let global = { day: "", runs: 0, usd: 0, tavily: 0 };

function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function rollGlobal(now = new Date()) {
  const d = today(now);
  if (global.day !== d) global = { day: d, runs: 0, usd: 0, tavily: 0 };
}

export type Denial = { ok: false; reason: string; retryAfterSec: number };

export function admit(ip: string, now = new Date()): { ok: true } | Denial {
  const LIMITS = limits();
  rollGlobal(now);
  if (global.runs >= LIMITS.globalRunsPerDay)
    return { ok: false, reason: "The public demo reached its daily run limit. Try again tomorrow (UTC).", retryAfterSec: 3600 };
  if (global.usd >= LIMITS.globalUsdPerDay)
    return { ok: false, reason: "The public demo reached its daily model budget. Try again tomorrow (UTC).", retryAfterSec: 3600 };
  if (global.tavily >= LIMITS.globalTavilyCreditsPerDay)
    return { ok: false, reason: "The public demo reached its daily search budget. Try again tomorrow (UTC).", retryAfterSec: 3600 };

  const hour = Math.floor(now.getTime() / 3_600_000);
  const d = today(now);
  const b = ipBuckets.get(ip) || { hour, hourCount: 0, day: d, dayCount: 0 };
  if (b.hour !== hour) {
    b.hour = hour;
    b.hourCount = 0;
  }
  if (b.day !== d) {
    b.day = d;
    b.dayCount = 0;
  }
  if (b.hourCount >= LIMITS.perIpPerHour)
    return { ok: false, reason: `Limit of ${LIMITS.perIpPerHour} runs per hour reached.`, retryAfterSec: 3600 - (Math.floor(now.getTime() / 1000) % 3600) };
  if (b.dayCount >= LIMITS.perIpPerDay)
    return { ok: false, reason: `Limit of ${LIMITS.perIpPerDay} runs per day reached.`, retryAfterSec: 3600 };
  b.hourCount++;
  b.dayCount++;
  ipBuckets.set(ip, b);
  global.runs++;
  if (ipBuckets.size > 10_000) ipBuckets.clear(); // memory guard
  return { ok: true };
}

export function recordSpend(usd: number, tavilyCredits: number) {
  rollGlobal();
  global.usd += usd;
  global.tavily += tavilyCredits;
}

export function globalRemaining() {
  const LIMITS = limits();
  rollGlobal();
  return {
    runs: Math.max(0, LIMITS.globalRunsPerDay - global.runs),
    usd: Math.max(0, +(LIMITS.globalUsdPerDay - global.usd).toFixed(4)),
    tavilyCredits: Math.max(0, +(LIMITS.globalTavilyCreditsPerDay - global.tavily).toFixed(1)),
  };
}

/** Test helper. */
export function _resetBudget() {
  ipBuckets.clear();
  global = { day: "", runs: 0, usd: 0, tavily: 0 };
}
