import { currentMode, limits, modeNote, modelChain, TAVILY_CREDITS_PER_COLD_CHECK } from "@/lib/config";
import { globalRemaining } from "@/lib/budget";
import { allowedDomains } from "@/lib/domains";
import { tavilyMonthlyStop, tavilyUsedThisMonth } from "@/lib/tavily-usage";

export const dynamic = "force-dynamic";

// Public status: which mode is active and what the caps are. Never returns keys
// or whether a key value looks valid, only whether it is set.
export async function GET() {
  const mode = currentMode();
  const L = limits();
  const used = mode === "live" ? await tavilyUsedThisMonth() : undefined;
  const stop = tavilyMonthlyStop();
  return Response.json({
    mode,
    modeNote: modeNote(mode),
    models: modelChain("nano"),
    allowedDomains: allowedDomains(),
    caps: {
      perIpPerHour: L.perIpPerHour,
      perIpPerDay: L.perIpPerDay,
      globalRunsPerDay: L.globalRunsPerDay,
      globalUsdPerDay: L.globalUsdPerDay,
      globalTavilyCreditsPerDay: L.globalTavilyCreditsPerDay,
      perRunUsd: L.perRunUsd,
      maxAgentSteps: L.maxAgentSteps,
      maxTavilyCallsPerRun: L.maxTavilyCallsPerRun,
      agentDeadlineMs: Number(process.env.APP_AGENT_DEADLINE_MS || 40_000),
    },
    // Counters live in memory on each server instance (no database), so this is
    // what the instance answering this request has left today (UTC).
    capsScope: "per server instance",
    // Tavily: what one check costs when it retrieves every page fresh (measured), how many such
    // checks the daily credit cap allows, and the account-wide monthly stop (all instances).
    tavily: {
      creditsPerColdCheck: TAVILY_CREDITS_PER_COLD_CHECK,
      coldChecksPerDay: Math.floor(L.globalTavilyCreditsPerDay / TAVILY_CREDITS_PER_COLD_CHECK),
      note: "Pages and searches are cached per URL per UTC day on each instance, so a repeat check that day costs less.",
      monthlyStop: stop,
      monthlyStopReached: used !== undefined && used >= stop,
    },
    remainingToday: globalRemaining(),
    whenCapped: "Page samples show a saved live result, labelled as such; other checks get a 'try again tomorrow' message.",
  });
}
