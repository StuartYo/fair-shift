import { currentMode, limits, modeNote, modelChain } from "@/lib/config";
import { globalRemaining } from "@/lib/budget";
import { allowedDomains } from "@/lib/domains";

export const dynamic = "force-dynamic";

// Public status: which mode is active and what the caps are. Never returns keys
// or whether a key value looks valid, only whether it is set.
export async function GET() {
  const mode = currentMode();
  const L = limits();
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
    remainingToday: globalRemaining(),
    whenCapped: "Page samples show a saved live result, labelled as such; other checks get a 'try again tomorrow' message.",
  });
}
