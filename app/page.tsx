import { currentMode, limits, modeNote, modelChain } from "@/lib/config";
import { allowedDomains } from "@/lib/domains";

export const dynamic = "force-dynamic";

// Placeholder page for the shared core. The product UI is added once the topic is fixed.
export default function Home() {
  const mode = currentMode();
  const L = limits();
  return (
    <main className="wrap">
      <h1>Agent core</h1>
      <p className={`badge ${mode}`}>{mode === "live" ? "Live" : "Demo mode"}</p>
      <p>{modeNote(mode)}</p>
      <h2>Model fallback chain</h2>
      <ol>
        {modelChain("nano").map((m) => (
          <li key={m}>
            <code>{m}</code>
          </li>
        ))}
      </ol>
      <h2>Official domains</h2>
      <p>{allowedDomains().join(", ")}</p>
      <h2>Demo caps</h2>
      <p>
        {L.perIpPerHour} runs per hour per visitor, {L.perIpPerDay} per day, at most US${L.perRunUsd} of model spend per run.
      </p>
    </main>
  );
}
