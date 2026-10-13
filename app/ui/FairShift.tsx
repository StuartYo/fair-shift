"use client";

import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  Info,
  Landmark,
  Loader2,
  Lock,
  Play,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { EVAL_CASES, type EvalCase } from "@/eval/cases";
import { NY_JOB_LABEL, NY_REGION_LABEL, specByKey } from "@/lib/wage/catalog";
import { fmtLineRate, fmtMoney, holidayLabel, ruleValueText, toMarkdown, whyLines } from "@/lib/wage/export";
import type { CheckInput, FairShiftReport, HolidayRecord, Jurisdiction, NyJob, NyRegion, RuleRecord } from "@/lib/wage/types";
import type { Citation, TraceStep } from "@/lib/types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** The case the "Try a sample payslip" button runs: worked National Day, paid straight time. */
const HERO_SAMPLE = "tw-holiday-unpaid";

function StepIcon({ kind }: { kind: TraceStep["kind"] }) {
  const p = { size: 15, "aria-hidden": true } as const;
  if (kind === "model") return <Cpu {...p} />;
  if (kind === "tool") return <Search {...p} />;
  if (kind === "guard") return <ShieldCheck {...p} />;
  return <Info {...p} />;
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function shorten(s: string, n = 170): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 3).trimEnd()}...` : t;
}

function Via({ c }: { c: Citation }) {
  return <span className="via">{c.via.startsWith("fixture") ? "Saved copy (demo mode)" : "Retrieved live with Tavily"}</span>;
}

/** The rules that changed the number: premiums, minimum wage top-ups, holidays. */
function keyRules(r: FairShiftReport): { rules: RuleRecord[]; holidays: HolidayRecord[] } {
  const c = r.computation;
  const keys = new Set<string>();
  for (const l of c.lines) {
    if (l.multiplier > 1 || l.deduction || l.label.startsWith("Spread")) l.ruleKeys.filter((k) => !k.includes("min_wage")).forEach((k) => keys.add(k));
  }
  const lastDate = r.shifts.map((s) => s.date).sort().at(-1) ?? "";
  const mw = r.rules
    .filter((x) => x.key.endsWith("min_wage_hourly") && (!x.region || x.region === r.input.nyRegion) && (x.effectiveFrom ?? "") <= lastDate)
    .sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""))[0];
  const usesMinWage = c.components.minWageTopUp > 0 || c.problems.some((p) => p.kind === "below_min_wage");
  const rules = r.rules.filter((x) => keys.has(x.key) && x.key !== "ny.tip_credit");
  const tip = keys.has("ny.tip_credit")
    ? r.rules
        .filter((x) => x.key === "ny.tip_credit" && x.region === r.input.nyRegion && (x.effectiveFrom ?? "") <= lastDate)
        .sort((a, b) => (b.effectiveFrom ?? "").localeCompare(a.effectiveFrom ?? ""))[0]
    : undefined;
  const holidays = r.holidays.filter((h) => r.shifts.some((s) => s.dayType === "holiday" && (h.date ? h.date === s.date : h.monthDay === s.date.slice(5))));
  return { rules: [...(usesMinWage && mw ? [mw] : []), ...(tip ? [tip] : []), ...rules].slice(0, 4), holidays: holidays.slice(0, 2) };
}

function MiniRule({ title, value, cit }: { title: string; value: string; cit?: Citation }) {
  return (
    <article className="mini">
      <header>
        <h3>{title}</h3>
        <span className="val">{value}</span>
      </header>
      {cit && (
        <>
          <blockquote lang={/[㐀-鿿]/.test(cit.quote) ? "zh-Hant" : "en"}>{shorten(cit.quote)}</blockquote>
          <p className="src">
            <a href={cit.url} target="_blank" rel="noreferrer">
              {shorten(cit.title, 70)} <ExternalLink size={12} aria-hidden />
            </a>
            <Via c={cit} />
          </p>
        </>
      )}
    </article>
  );
}

export default function FairShift({ initialMode, initialNote }: { initialMode: "live" | "mock"; initialNote: string }) {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("TW");
  const [region, setRegion] = useState<NyRegion>("nyc");
  const [job, setJob] = useState<NyJob>("general");
  const [schedule, setSchedule] = useState(EVAL_CASES[0].input.scheduleText);
  const [payslip, setPayslip] = useState(EVAL_CASES[0].input.payslipText);
  const [restDay, setRestDay] = useState<string>("");
  const [dayOff, setDayOff] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [report, setReport] = useState<FairShiftReport | null>(null);
  const [reportTitle, setReportTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState({ mode: initialMode, note: initialNote });
  const [copied, setCopied] = useState(false);
  const verdictRef = useRef<HTMLElement>(null);

  const samples = useMemo(() => EVAL_CASES.filter((c) => c.input.jurisdiction === jurisdiction), [jurisdiction]);

  function fill(c: EvalCase) {
    setJurisdiction(c.input.jurisdiction);
    if (c.input.nyRegion) setRegion(c.input.nyRegion);
    setJob(c.input.nyJob ?? "general");
    setSchedule(c.input.scheduleText);
    setPayslip(c.input.payslipText);
    setRestDay("");
    setDayOff("");
    setReport(null);
    setSteps([]);
  }

  function loadSample(id: string) {
    const c = EVAL_CASES.find((x) => x.id === id);
    if (c) fill(c);
  }

  async function trySample() {
    const c = EVAL_CASES.find((x) => x.id === HERO_SAMPLE)!;
    fill(c);
    await run({ ...c.input }, `Sample: ${c.title}`);
  }

  function currentInput(): CheckInput {
    return {
      jurisdiction,
      nyRegion: jurisdiction === "US-NY" ? region : undefined,
      nyJob: jurisdiction === "US-NY" ? job : undefined,
      scheduleText: schedule,
      payslipText: payslip,
      restDayWeekday: restDay === "" ? undefined : Number(restDay),
      dayOffWeekday: dayOff === "" ? undefined : Number(dayOff),
    };
  }

  async function run(input: CheckInput = currentInput(), title: string | null = null) {
    setBusy(true);
    setError(null);
    setReport(null);
    setReportTitle(title);
    setSteps([]);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "mode") setMode({ mode: ev.mode, note: ev.note });
          if (ev.type === "step") setSteps((s) => [...s, ev.step]);
          if (ev.type === "report") {
            setReport(ev.report);
            requestAnimationFrame(() => verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
          }
          if (ev.type === "error") setError(ev.message);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const c = report?.computation;
  const cur = c?.currency ?? (jurisdiction === "TW" ? "TWD" : "USD");
  const gap = c?.shortfall ?? 0;
  const demo = mode.mode === "mock";
  const key = report ? keyRules(report) : null;
  const why = report ? whyLines(report) : [];

  return (
    <div className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">Hourly pay checker for Taiwan and New York</p>
          <h1>Fair Shift</h1>
          <p className="lede">
            Paste your shifts and your payslip. Fair Shift reads the current wage rules from government websites, does the math in code, and shows the exact law text behind every number.
          </p>
          <div className="cta">
            <button className="go big" onClick={trySample} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} aria-hidden /> : <Play size={18} aria-hidden />}
              Try a sample payslip
            </button>
            <span className="muted">Synthetic store clerk in Taipei who worked National Day.</span>
          </div>
        </div>
        <span className={`badge ${mode.mode}`} title={mode.note}>
          {mode.mode === "live" ? "Live" : "Demo mode"}
        </span>
      </header>
      {demo && (
        <p className="banner">
          <Info size={15} aria-hidden /> {mode.note}
        </p>
      )}

      {report && c && key && (
        <section className={`verdict ${gap > 0 ? "bad" : "good"}`} ref={verdictRef} aria-live="polite">
          <p className="kicker">
            {reportTitle ?? "Your check"}
            {demo && <span className="tag">Demo mode</span>}
          </p>
          <h2 className="vhead">
            {c.shortfall === undefined ? (
              <>Expected pay: {fmtMoney(c.expectedTotal, cur)}</>
            ) : gap > 0 ? (
              <>You were underpaid {fmtMoney(gap, cur)}</>
            ) : (
              <>
                <CheckCircle2 size={28} aria-hidden /> No underpayment found
              </>
            )}
          </h2>
          <p className="vsub">
            Expected {fmtMoney(c.expectedTotal, cur)}
            {c.paidTotal !== undefined ? `, paid ${fmtMoney(c.paidTotal, cur)}` : ", no total found on the payslip"}. {c.workedHours} hours across {report.shifts.length} shift(s).
          </p>
          {why.length > 0 && (
            <ul className="vfind">
              {why.map((w, i) => (
                <li key={i}>
                  <AlertTriangle size={14} aria-hidden />
                  <span>
                    {w.text}
                    {w.amount !== undefined && <b>: {fmtMoney(w.amount, cur)}</b>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(key.rules.length > 0 || key.holidays.length > 0) && (
            <>
              <h3 className="vrules-h">
                <Landmark size={15} aria-hidden /> The rules behind this number
              </h3>
              <div className="vrules">
                {key.holidays.map((h, i) => (
                  <MiniRule key={`h${i}`} title={`National holiday: ${h.name}`} value={holidayLabel(h)} cit={h.citations.at(-1)} />
                ))}
                {key.rules.map((r, i) => (
                  <MiniRule key={i} title={specByKey(r.key)?.label ?? r.key} value={ruleValueText(r, cur)} cit={r.citations[0]} />
                ))}
              </div>
            </>
          )}
          <a className="more" href="#details">
            <ArrowDown size={14} aria-hidden /> Every line, every source, and a message to your employer
          </a>
        </section>
      )}

      <section className="grid">
        <div className="card input">
          <h2>Check your own pay</h2>
          <div className="seg" role="tablist" aria-label="Where you work">
            {(["TW", "US-NY"] as Jurisdiction[]).map((j) => (
              <button key={j} role="tab" aria-selected={jurisdiction === j} className={jurisdiction === j ? "on" : ""} onClick={() => setJurisdiction(j)}>
                {j === "TW" ? "Taiwan" : "New York"}
              </button>
            ))}
          </div>
          {jurisdiction === "US-NY" ? (
            <div className="row2">
              <label className="field">
                Region
                <select value={region} onChange={(e) => setRegion(e.target.value as NyRegion)}>
                  {(Object.keys(NY_REGION_LABEL) as NyRegion[]).map((r) => (
                    <option key={r} value={r}>
                      {NY_REGION_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Job
                <select value={job} onChange={(e) => setJob(e.target.value as NyJob)}>
                  {(Object.keys(NY_JOB_LABEL) as NyJob[]).map((k) => (
                    <option key={k} value={k}>
                      {NY_JOB_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="row2">
              <label className="field">
                Rest day (休息日)
                <select value={restDay} onChange={(e) => setRestDay(e.target.value)}>
                  <option value="">Not fixed</option>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Regular day off (例假)
                <select value={dayOff} onChange={(e) => setDayOff(e.target.value)}>
                  <option value="">Not fixed</option>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="samples">
            <span>More synthetic samples:</span>
            {samples.map((s) => (
              <button key={s.id} className="chip" onClick={() => loadSample(s.id)}>
                {s.title}
              </button>
            ))}
          </div>
          <label className="field">
            Schedule or timesheet
            <textarea value={schedule} onChange={(e) => setSchedule(e.target.value)} rows={7} spellCheck={false} placeholder="10/5(一) 17:00-22:00 or Mon Oct 5 9am-6pm (30 min break)" />
          </label>
          <label className="field">
            Payslip
            <textarea value={payslip} onChange={(e) => setPayslip(e.target.value)} rows={5} spellCheck={false} placeholder="時薪 196 / 實發 4,312 or Hourly rate: $17.00 / Gross pay: $722.50" />
          </label>
          <p className="privacy">
            <Lock size={14} aria-hidden /> Names, ID numbers, phone numbers, emails and account numbers are removed before anything reaches a model or a search API. Please use synthetic data on this public demo.
          </p>
          <button className="go" onClick={() => run()} disabled={busy}>
            {busy ? <Loader2 className="spin" size={18} aria-hidden /> : <ShieldCheck size={18} aria-hidden />}
            {busy ? "Checking" : "Check my pay"}
          </button>
          {error && (
            <p className="err" role="alert">
              <AlertTriangle size={16} aria-hidden /> {error}
            </p>
          )}
        </div>

        <div className="card trace" aria-live="polite">
          <h2>
            What the agent did {demo && <span className="tag">Demo mode</span>}
          </h2>
          {steps.length === 0 && !busy && <p className="muted">Steps appear here as the agent reads the schedule, fetches official pages, checks every quote and computes pay.</p>}
          {demo && steps.length > 0 && <p className="muted small">Scripted stand-in for the model; pages are saved copies. Every check below is the real code.</p>}
          <ol>
            {steps.map((s, i) => (
              <li key={i} className={`step ${s.kind}`}>
                <StepIcon kind={s.kind} />
                <span className="sname">{s.name}</span>
                <span className="sdetail">{s.detail}</span>
                {s.model && <span className="smodel">{s.model}</span>}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {report && c && (
        <section className="results" id="details">
          <div className="totals">
            <div className="tot">
              <span>Expected</span>
              <strong>{fmtMoney(c.expectedTotal, cur)}</strong>
            </div>
            <div className="tot">
              <span>Paid</span>
              <strong>{c.paidTotal !== undefined ? fmtMoney(c.paidTotal, cur) : "Not found"}</strong>
            </div>
            <div className={`tot big ${gap > 0 ? "bad" : "good"}`}>
              <span>{gap > 0 ? "Underpaid by" : "Difference"}</span>
              <strong>{c.shortfall !== undefined ? fmtMoney(Math.max(0, gap), cur) : "n/a"}</strong>
              {gap <= 0 && c.shortfall !== undefined && (
                <em>
                  <CheckCircle2 size={14} aria-hidden /> No shortfall found
                </em>
              )}
            </div>
          </div>

          {c.problems.length > 0 && (
            <ul className="problems">
              {c.problems.map((p, i) => (
                <li key={i} className={p.kind}>
                  <AlertTriangle size={15} aria-hidden /> {p.message}
                  {p.amount !== undefined && <b> {fmtMoney(p.amount, cur)}</b>}
                </li>
              ))}
            </ul>
          )}

          <div className="card">
            <h2>Line by line</h2>
            <p className="muted">
              {report.shifts.length} shift(s), {c.workedHours} hours. Read by {report.parse.source === "model" ? report.parse.model : "the rule-based parser"}. {report.parse.crossCheck}
            </p>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Hours</th>
                    <th>Rate</th>
                    <th>Multiplier</th>
                    <th>Amount</th>
                    <th>Rules</th>
                  </tr>
                </thead>
                <tbody>
                  {c.lines.map((l, i) => {
                    const sh = report.shifts.find((s) => s.id === l.shiftId);
                    return (
                      <tr key={i} className={l.multiplier > 1 || l.label.startsWith("Spread") ? "prem" : ""}>
                        <td>
                          {l.date}
                          {sh && sh.dayType !== "workday" && <small>{sh.holidayName ?? sh.dayType.replace(/_/g, " ")}</small>}
                        </td>
                        <td>
                          {l.label}
                          {l.note && <small>{l.note}</small>}
                        </td>
                        <td>{l.hours}</td>
                        <td>{fmtMoney(l.baseRate, cur, true)}</td>
                        <td>{fmtLineRate(l, cur)}</td>
                        <td>{fmtMoney(l.amount, cur, true)}</td>
                        <td>
                          {l.ruleKeys.map((k) => (
                            <a key={k} className="rk" href={`#rule-${k}`}>
                              {k}
                            </a>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Official rules used</h2>
            <p className="muted">
              Every value below was read by code from the quoted text, which was {demo ? "taken from the saved copies of the official pages" : "retrieved during this check"}. Nothing comes from model memory.
            </p>
            <div className="rules">
              {report.rules.map((r, i) => (
                <article key={i} className="rule" id={i === report.rules.findIndex((x) => x.key === r.key) ? `rule-${r.key}` : undefined}>
                  <header>
                    <h3>{specByKey(r.key)?.label ?? r.key}</h3>
                    <span className="val">{ruleValueText(r, cur)}</span>
                  </header>
                  <p className="meta">
                    {r.effectiveFrom && (
                      <>
                        From {r.effectiveFrom}
                        {r.effectiveTo ? ` to ${r.effectiveTo}` : ""}.{" "}
                      </>
                    )}
                    {r.region && <>{NY_REGION_LABEL[r.region]}. </>}
                    {r.variant && <>{NY_JOB_LABEL[r.variant]}. </>}
                    <span className={r.status === "in_force" ? "ok" : "warn"}>{r.status === "in_force" ? "In force" : "Decided, pending approval"}</span>
                    {" | "}
                    {r.recordedBy === "agent" ? "Recorded by the agent" : "Read by code fallback"}
                  </p>
                  {r.citations.map((ci, k) => (
                    <figure key={k}>
                      <blockquote lang={/[㐀-鿿]/.test(ci.quote) ? "zh-Hant" : "en"}>{ci.quote}</blockquote>
                      <figcaption>
                        <a href={ci.url} target="_blank" rel="noreferrer">
                          {ci.title} <ExternalLink size={12} aria-hidden />
                        </a>
                        <Via c={ci} />
                      </figcaption>
                    </figure>
                  ))}
                </article>
              ))}
              {report.holidays.map((h, i) => (
                <article key={`h${i}`} className="rule">
                  <header>
                    <h3>National holiday: {h.name}</h3>
                    <span className="val">{holidayLabel(h)}</span>
                  </header>
                  {h.dateSource && (
                    <p className="meta">
                      {h.dateSource.note}{" "}
                      <a href={h.dateSource.url} target="_blank" rel="noreferrer">
                        {h.dateSource.title}
                      </a>
                    </p>
                  )}
                  {h.citations.map((ci, k) => (
                    <figure key={k}>
                      <blockquote lang="zh-Hant">{ci.quote}</blockquote>
                      <figcaption>
                        <a href={ci.url} target="_blank" rel="noreferrer">
                          {ci.title} <ExternalLink size={12} aria-hidden />
                        </a>
                        <Via c={ci} />
                      </figcaption>
                    </figure>
                  ))}
                </article>
              ))}
            </div>
          </div>

          <div className="card two">
            <div>
              <h2>In plain words</h2>
              <p>{report.explanation.text}</p>
              {c.assumptions.length > 0 && (
                <>
                  <h3>Assumptions</h3>
                  <ul className="assume">
                    {c.assumptions.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div>
              <h2>Message to your employer</h2>
              <pre className="msg">{report.explanation.messageToEmployer}</pre>
              <div className="actions">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(report.explanation.messageToEmployer);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  <Copy size={15} aria-hidden /> {copied ? "Copied" : "Copy message"}
                </button>
                <button onClick={() => download(`fair-shift-${report.id}.md`, toMarkdown(report), "text/markdown")}>
                  <FileText size={15} aria-hidden /> Markdown
                </button>
                <button onClick={() => download(`fair-shift-${report.id}.json`, JSON.stringify(report, null, 2), "application/json")}>
                  <Download size={15} aria-hidden /> JSON
                </button>
              </div>
            </div>
          </div>

          <p className="cost">
            {demo ? (
              <>Demo mode: no paid model or search calls were made. </>
            ) : (
              <>
                This check: {report.usage.modelCalls} model call(s), about US${report.usage.estCostUsd.toFixed(4)}, {report.usage.tavilyCredits} Tavily credit(s).{" "}
              </>
            )}
            {!demo && report.modelsUsed.length > 0 && <>Models: {report.modelsUsed.join(", ")}.</>} {report.redactions > 0 && <>{report.redactions} personal detail(s) removed before sending.</>}
          </p>
          <p className="disclaimer">{report.disclaimer}</p>
        </section>
      )}
    </div>
  );
}
