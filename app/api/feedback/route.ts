import { clientIp } from "@/lib/http";
import { cleanFeedback, FEEDBACK_PREFIX } from "@/lib/feedback";

export const dynamic = "force-dynamic";

// Tester feedback: "Was this right?" on the result page. Only these fields are
// accepted, and only these are written to the server log (one line with the
// prefix below, readable in the Vercel runtime logs): the answer, an optional
// comment of up to 300 characters (personal details removed by the same filter
// as the check), the page language and the app version. The schedule, the
// payslip and the result are never sent here; any other field in the request
// is ignored. The IP is used only for an in-memory rate limit and is not logged.

const PER_IP_PER_HOUR = 10;
const hits = new Map<string, { hour: number; n: number }>();

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const entry = cleanFeedback(body);
  if (typeof entry === "string") return Response.json({ error: entry }, { status: 400 });
  const ip = clientIp(req);
  const hour = Math.floor(Date.now() / 3_600_000);
  const h = hits.get(ip);
  const n = h && h.hour === hour ? h.n + 1 : 1;
  if (n > PER_IP_PER_HOUR) return Response.json({ error: "Too many feedback messages this hour." }, { status: 429 });
  if (hits.size > 10_000) hits.clear();
  hits.set(ip, { hour, n });
  // The only log line the app writes. No schedule, payslip, result or IP.
  console.log(`${FEEDBACK_PREFIX} ${JSON.stringify({ at: new Date().toISOString(), ...entry })}`);
  return Response.json({ ok: true });
}
