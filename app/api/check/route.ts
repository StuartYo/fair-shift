import fixtures from "@/fixtures/official-pages.json";
import { matchSample } from "@/eval/samples";
import { admit, recordSpend } from "@/lib/budget";
import { limits, modeNoteZh } from "@/lib/config";
import { clientIp, ndjsonStream } from "@/lib/http";
import { precomputedFor } from "@/lib/precomputed";
import { getProviders } from "@/lib/providers";
import type { FixtureSet } from "@/lib/search/fixture";
import { rulesMockScript } from "@/lib/wage/agent";
import { runFairShift } from "@/lib/wage/run";
import type { CheckInput, NyJob, NyRegion } from "@/lib/wage/types";

export const dynamic = "force-dynamic";
// A live check takes 15 to 30 seconds. The agent stops starting new turns at
// 40 s (APP_AGENT_DEADLINE_MS) and code finishes from the text already
// retrieved, so a run ends well inside this limit.
export const maxDuration = 120;

function parseBody(b: unknown): (CheckInput & { sampleId?: string }) | string {
  if (!b || typeof b !== "object") return "Invalid request.";
  const o = b as Record<string, unknown>;
  const j = o.jurisdiction;
  if (j !== "TW" && j !== "US-NY") return "jurisdiction must be TW or US-NY.";
  const s = typeof o.scheduleText === "string" ? o.scheduleText : "";
  const p = typeof o.payslipText === "string" ? o.payslipText : "";
  if (!s.trim()) return "Paste a schedule first.";
  const max = limits().maxInputChars;
  if (s.length > max || p.length > max) return `Each box is limited to ${max} characters.`;
  const wd = (v: unknown) => (v === null ? null : typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6 ? v : undefined);
  const region = (["nyc", "li_westchester", "rest"] as const).includes(o.nyRegion as NyRegion) ? (o.nyRegion as NyRegion) : "nyc";
  const job = (["general", "hospitality", "food_service", "service"] as const).includes(o.nyJob as NyJob) ? (o.nyJob as NyJob) : "general";
  const rate = typeof o.hourlyRate === "number" && Number.isFinite(o.hourlyRate) && o.hourlyRate > 0 && o.hourlyRate < 10_000 ? o.hourlyRate : undefined;
  const tips = (["yes", "no", "unsure"] as const).includes(o.nyTipsInGross as "yes") ? (o.nyTipsInGross as "yes" | "no" | "unsure") : undefined;
  return {
    jurisdiction: j,
    nyRegion: j === "US-NY" ? region : undefined,
    nyJob: j === "US-NY" ? job : undefined,
    nyTipsInGross: j === "US-NY" ? tips : undefined,
    scheduleText: s,
    payslipText: p,
    hourlyRate: rate,
    restDayWeekday: wd(o.restDayWeekday),
    dayOffWeekday: wd(o.dayOffWeekday),
    workweekStart: wd(o.workweekStart) ?? undefined,
    sampleId: typeof o.sampleId === "string" ? o.sampleId.slice(0, 60) : undefined,
  };
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });
  const { sampleId, ...input } = parsed;
  const sample = matchSample(sampleId, input);
  const p = getProviders({ fixtures: fixtures as FixtureSet, script: rulesMockScript() });

  const gate = admit(clientIp(req));
  if (!gate.ok) {
    // A sample still shows a real (saved) result; anything else gets the limit message.
    const saved = sample ? precomputedFor(sample.id, "limit") : undefined;
    if (!saved) return Response.json({ error: gate.reason }, { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } });
    return ndjsonStream(async (send) => {
      send({ type: "mode", mode: p.mode, note: p.modeNote, noteZh: modeNoteZh(p.mode) });
      send({ type: "report", report: saved });
    });
  }

  return ndjsonStream(async (send) => {
    send({ type: "mode", mode: p.mode, note: p.modeNote, noteZh: modeNoteZh(p.mode) });
    try {
      const report = await runFairShift(input, {
        llm: p.llm,
        search: p.search,
        mode: p.mode,
        modeNote: p.modeNote,
        onEvent: (step) => send({ type: "step", step }),
        onPartial: (r) => send({ type: "report", report: r, partial: true }),
      });
      recordSpend(report.usage.estCostUsd, report.usage.tavilyCredits);
      send({ type: "report", report });
    } catch (e) {
      const saved = sample ? precomputedFor(sample.id, "error") : undefined;
      if (saved) send({ type: "report", report: saved });
      else send({ type: "error", message: (e as Error).message.slice(0, 200) });
    }
  });
}
