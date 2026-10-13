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
      perRunUsd: L.perRunUsd,
      maxAgentSteps: L.maxAgentSteps,
      maxTavilyCallsPerRun: L.maxTavilyCallsPerRun,
    },
    remainingToday: globalRemaining(),
  });
}
