import { SAMPLE_CASES } from "@/eval/samples";
import { precomputedFor } from "@/lib/precomputed";

export const dynamic = "force-dynamic";

// GET /api/sample?id=<sample id>: the saved live result for a page sample.
// The page asks for it only when a live check of an unchanged sample was cut
// off (for example the connection dropped). No model or search calls.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!SAMPLE_CASES.some((c) => c.id === id)) return Response.json({ error: "Unknown sample." }, { status: 404 });
  const r = precomputedFor(id, "error");
  if (!r) return Response.json({ error: "No saved result for this sample." }, { status: 404 });
  return Response.json({ report: r });
}
