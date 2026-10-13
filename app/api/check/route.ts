import fixtures from "@/fixtures/official-pages.json";
import { admit, recordSpend } from "@/lib/budget";
import { limits } from "@/lib/config";
import { clientIp, ndjsonStream } from "@/lib/http";
import { getProviders } from "@/lib/providers";
import type { FixtureSet } from "@/lib/search/fixture";
import { rulesMockScript } from "@/lib/wage/agent";
import { runFairShift } from "@/lib/wage/run";
import type { CheckInput, NyRegion } from "@/lib/wage/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function parseBody(b: unknown): CheckInput | string {
  if (!b || typeof b !== "object") return "Invalid request.";
  const o = b as Record<string, unknown>;
  const j = o.jurisdiction;
  if (j !== "TW" && j !== "US-NY") return "jurisdiction must be TW or US-NY.";
  const s = typeof o.scheduleText === "string" ? o.scheduleText : "";
  const p = typeof o.payslipText === "string" ? o.payslipText : "";
  if (!s.trim()) return "Paste a schedule first.";
  const max = limits().maxInputChars;
  if (s.length > max || p.length > max) return `Each box is limited to ${max} characters.`;
  const wd = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6 ? v : undefined);
  const region = (["nyc", "li_westchester", "rest"] as const).includes(o.nyRegion as NyRegion) ? (o.nyRegion as NyRegion) : "nyc";
  return {
    jurisdiction: j,
    nyRegion: j === "US-NY" ? region : undefined,
    scheduleText: s,
    payslipText: p,
    restDayWeekday: wd(o.restDayWeekday),
    dayOffWeekday: wd(o.dayOffWeekday),
    workweekStart: wd(o.workweekStart),
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const input = parseBody(body);
  if (typeof input === "string") return Response.json({ error: input }, { status: 400 });

  const gate = admit(clientIp(req));
  if (!gate.ok) return Response.json({ error: gate.reason }, { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } });

  const p = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });
  return ndjsonStream(async (send) => {
    send({ type: "mode", mode: p.mode, note: p.modeNote });
    const report = await runFairShift(input, {
      llm: p.llm,
      search: p.search,
      mode: p.mode,
      modeNote: p.modeNote,
      onEvent: (step) => send({ type: "step", step }),
    });
    recordSpend(report.usage.estCostUsd, report.usage.tavilyCredits);
    send({ type: "report", report });
  });
}
