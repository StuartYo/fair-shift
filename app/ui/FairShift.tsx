"use client";

import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  ClipboardList,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  Info,
  Landmark,
  Languages,
  Loader2,
  Lock,
  Phone,
  Play,
  Printer,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { EVAL_CASES, type EvalCase } from "@/eval/cases";
import { NY_JOB_LABEL, NY_REGION_LABEL } from "@/lib/wage/catalog";
import { reasons } from "@/lib/wage/explain";
import { fmtMoney, holidayLabel, lineRateWords, ruleValueWords, toMarkdown } from "@/lib/wage/export";
import { citeOf, DISCLAIMER_ZH, lineLabel, lineNote, lineRuleKeys, nextSteps, notChecked, ruleTitle, splitRules, type Lang } from "@/lib/wage/i18n";
import type { CheckInput, FairShiftReport, HolidayRecord, Jurisdiction, NyJob, NyRegion, RuleRecord } from "@/lib/wage/types";
import type { Citation, TraceStep } from "@/lib/types";

/** The case the "Try a sample payslip" button runs: worked National Day, paid straight time. */
const HERO_SAMPLE = "tw-holiday-unpaid";
const WD: Record<Lang, string[]> = {
  zh: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

const T = {
  eyebrow: { zh: "台灣與紐約的時薪核對工具", en: "Hourly pay checker for Taiwan and New York" },
  lede: {
    zh: "貼上班表和薪資單。Fair Shift 會到政府網站讀現行的工資規定，用程式算錢，每個數字都附上法條原文。",
    en: "Paste your shifts and your payslip. Fair Shift reads the current wage rules from government websites, does the math in code, and shows the exact law text behind every number.",
  },
  trySample: { zh: "試試範例薪資單", en: "Try a sample payslip" },
  sampleNote: { zh: "範例資料：台北店員國慶日上班，只拿到原時薪。", en: "Synthetic store clerk in Taipei who worked National Day." },
  live: { zh: "線上模式", en: "Live" },
  demo: { zh: "示範模式", en: "Demo mode" },
  yourCheck: { zh: "你的核對結果", en: "Your check" },
  underpaid: { zh: "你少領了", en: "You were underpaid" },
  expectedOnly: { zh: "應領", en: "Expected pay:" },
  noGap: { zh: "沒有發現短少", en: "No underpayment found" },
  premises: { zh: "這個數字的前提", en: "This number assumes" },
  lowConf: { zh: "班表讀取不確定", en: "Schedule read with low confidence" },
  why: { zh: "差在哪裡", en: "Why" },
  rulesBehind: { zh: "這個數字依據的規定", en: "The rules behind this number" },
  next: { zh: "接下來可以怎麼做", en: "What you can do next" },
  more: { zh: "逐行計算、所有出處、給雇主的訊息", en: "Every line, every source, and a message to your employer" },
  checkOwn: { zh: "核對自己的薪水", en: "Check your own pay" },
  tw: { zh: "台灣", en: "Taiwan" },
  ny: { zh: "紐約", en: "New York" },
  region: { zh: "地區", en: "Region" },
  job: { zh: "工作類型", en: "Job" },
  restDay: { zh: "休息日", en: "Rest day (休息日)" },
  dayOff: { zh: "例假", en: "Regular day off (例假)" },
  choose: { zh: "請選擇", en: "Choose" },
  notFixed: { zh: "不固定／不知道", en: "Not fixed / not sure" },
  askDays: {
    zh: "先告訴我你的休息日和例假是星期幾。這會改變金額：同一天上班，算休息日和算國定假日差很多。不確定就選「不固定／不知道」。",
    en: "Tell me your rest day and regular day off first. It changes the amount: the same shift is paid differently on a rest day and on a holiday. If you are not sure, choose “Not fixed / not sure”.",
  },
  samples: { zh: "其他範例（皆為虛構資料）", en: "More samples (all synthetic)" },
  pickSample: { zh: "選一個範例…", en: "Pick a sample…" },
  schedule: { zh: "班表或打卡紀錄", en: "Schedule or timesheet" },
  payslip: { zh: "薪資單", en: "Payslip" },
  privacy: {
    zh: "送出前會先遮掉姓名、身分證字號、電話、Email、帳號、店名和統編，再交給模型或搜尋。Fair Shift 不儲存、也不記錄你貼上的內容；主機只留一般連線紀錄（時間、路徑、IP），不含內容。遮蔽不一定抓得到所有名字，請自己也把姓名蓋掉再貼。",
    en: "Names, ID numbers, phones, emails, account numbers, shop names and tax IDs are removed before anything reaches a model or a search API. Fair Shift does not store or log what you paste; the host keeps ordinary request logs (time, path, IP), not the text. The filter can miss a name, so cover names yourself before pasting.",
  },
  check: { zh: "核對我的薪水", en: "Check my pay" },
  checking: { zh: "核對中", en: "Checking" },
  agent: { zh: "代理做了什麼", en: "What the agent did" },
  agentEmpty: {
    zh: "按下核對後，這裡會一步步顯示代理讀班表、抓官方網頁、檢查每段引文、算錢的過程。",
    en: "Steps appear here as the agent reads the schedule, fetches official pages, checks every quote and computes pay.",
  },
  demoTrace: { zh: "示範模式：模型由腳本代替，網頁是存檔；下面每一個檢查都是真的程式。", en: "Scripted stand-in for the model; pages are saved copies. Every check below is the real code." },
  expected: { zh: "應領", en: "Expected" },
  paid: { zh: "實領", en: "Paid" },
  diff: { zh: "差額", en: "Difference" },
  notFound: { zh: "找不到", en: "Not found" },
  lines: { zh: "逐行計算", en: "Line by line" },
  date: { zh: "日期", en: "Date" },
  item: { zh: "項目", en: "Item" },
  hours: { zh: "時數", en: "Hours" },
  rate: { zh: "時薪", en: "Rate" },
  payRule: { zh: "算法", en: "Pay rule" },
  amount: { zh: "金額", en: "Amount" },
  basis: { zh: "依據", en: "Rule" },
  rulesUsed: { zh: "用到的官方規定（含原文）", en: "Official rules used (with the exact text)" },
  rulesNote: {
    zh: "下面每個數值都是程式從引文讀出來的，引文必須和這次取得的官方網頁一字不差。沒有任何數字來自模型的記憶。",
    en: "Every value below was read by code from the quoted text, and every quote matches the official page retrieved for this check word for word. Nothing comes from model memory.",
  },
  otherRules: { zh: "這次也取得、但沒用到的規定", en: "Also retrieved, not used for these shifts" },
  inForce: { zh: "現行有效", en: "In force" },
  pending: { zh: "已決定，尚待行政院核定", en: "Decided, pending approval" },
  byAgent: { zh: "代理自己記錄", en: "Recorded by the agent" },
  byCode: { zh: "代理沒記到，程式從取得的原文讀出", en: "Agent missed it; code read it from the retrieved text" },
  plain: { zh: "白話說明", en: "In plain words" },
  assumptions: { zh: "計算時的假設", en: "Assumptions" },
  msg: { zh: "給雇主的訊息", en: "Message to your employer" },
  copy: { zh: "複製訊息", en: "Copy message" },
  copied: { zh: "已複製", en: "Copied" },
  print: { zh: "列印一頁式報告／存成 PDF", en: "Print one-page report / save as PDF" },
  notChecked: { zh: "這個工具沒有檢查的事", en: "What this tool does not check" },
  holidayTitle: { zh: "國定假日", en: "National holiday" },
  saved: { zh: "存檔（示範模式）", en: "Saved copy (demo mode)" },
  liveTavily: { zh: "這次用 Tavily 即時取得", en: "Retrieved live with Tavily" },
  cantRead: { zh: "我看不懂這份班表", en: "I could not read this schedule" },
  unreadLines: { zh: "沒讀懂的行：", en: "Lines I could not read:" },
  example: { zh: "可以這樣寫：", en: "For example:" },
} satisfies Record<string, Record<Lang, string>>;

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

function Via({ c, lang }: { c: Citation; lang: Lang }) {
  return <span className="via">{c.via.startsWith("fixture") ? T.saved[lang] : T.liveTavily[lang]}</span>;
}

/** Holidays that made a shift a holiday shift in this result. */
function usedHolidays(r: FairShiftReport): HolidayRecord[] {
  return r.holidays.filter((h) => r.shifts.some((s) => s.dayType === "holiday" && (h.date ? h.date === s.date : h.monthDay === s.date.slice(5))));
}

function MiniRule({ title, sub, value, cit, lang }: { title: string; sub?: string; value: string; cit?: Citation; lang: Lang }) {
  return (
    <article className="mini">
      <header>
        <h3>
          {title}
          {sub && <small>{sub}</small>}
        </h3>
        <span className="val">{value}</span>
      </header>
      {cit && (
        <>
          <blockquote lang={/[㐀-鿿]/.test(cit.quote) ? "zh-Hant" : "en"}>{shorten(cit.quote)}</blockquote>
          <p className="src">
            <a href={cit.url} target="_blank" rel="noreferrer">
              {shorten(cit.title, 70)} <ExternalLink size={12} aria-hidden />
            </a>
            <Via c={cit} lang={lang} />
          </p>
        </>
      )}
    </article>
  );
}

function RuleCard({ r, lang, cur, demo, note }: { r: RuleRecord; lang: Lang; cur: "TWD" | "USD"; demo: boolean; note?: string }) {
  return (
    <article className="rule" id={`rule-${r.key}${r.effectiveFrom ? `-${r.effectiveFrom}` : ""}`}>
      <header>
        <h3>
          {ruleTitle(r.key, lang)}
          <small>{citeOf(r.key, lang)}</small>
        </h3>
        <span className="val">{ruleValueWords(r, cur, lang)}</span>
      </header>
      <p className="meta">
        {r.effectiveFrom && (
          <>
            {lang === "zh" ? `${r.effectiveFrom} 起` : `From ${r.effectiveFrom}`}
            {r.effectiveTo ? (lang === "zh" ? `至 ${r.effectiveTo}` : ` to ${r.effectiveTo}`) : ""}.{" "}
          </>
        )}
        {r.region && <>{NY_REGION_LABEL[r.region]}. </>}
        {r.variant && <>{NY_JOB_LABEL[r.variant]}. </>}
        {note ? <span className="warn">{note}</span> : <span className={r.status === "in_force" ? "ok" : "warn"}>{r.status === "in_force" ? T.inForce[lang] : T.pending[lang]}</span>}
        {" | "}
        {r.recordedBy === "agent" ? T.byAgent[lang] : T.byCode[lang]}
      </p>
      {r.citations.map((ci, k) => (
        <figure key={k}>
          <blockquote lang={/[㐀-鿿]/.test(ci.quote) ? "zh-Hant" : "en"}>{ci.quote}</blockquote>
          <figcaption>
            <a href={ci.url} target="_blank" rel="noreferrer">
              {ci.title} <ExternalLink size={12} aria-hidden />
            </a>
            {!demo || ci.via.startsWith("fixture") ? <Via c={ci} lang={lang} /> : null}
          </figcaption>
        </figure>
      ))}
    </article>
  );
}

function NextSteps({ j, lang }: { j: Jurisdiction; lang: Lang }) {
  return (
    <section className="next" aria-label={T.next[lang]}>
      <h3>
        <ClipboardList size={15} aria-hidden /> {T.next[lang]}
      </h3>
      <ol>
        {nextSteps(j).map((s, i) => (
          <li key={i}>
            {s[lang]}
            {s.tel && (
              <a className="tel" href={`tel:${s.tel.replace(/-/g, "")}`}>
                <Phone size={13} aria-hidden /> {s.tel}
              </a>
            )}
            {s.link && (
              <a className="src-link" href={s.link.href} target="_blank" rel="noreferrer">
                {s.link[lang]} <ExternalLink size={11} aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** One page for print or PDF: the verdict, why, each line, the rules with links. */
function PrintReport({ r, lang }: { r: FairShiftReport; lang: Lang }) {
  const c = r.computation;
  const cur = c.currency;
  const zh = lang === "zh";
  const { used } = splitRules(r);
  const rs = reasons(c, r.shifts, r.rules);
  return (
    <div className="printonly" lang={zh ? "zh-Hant" : "en"}>
      <h1>{zh ? "Fair Shift 薪資核對報告" : "Fair Shift pay check report"}</h1>
      <p className="pmeta">
        {zh ? "核對日期" : "Checked"} {new Date(r.createdAt).toLocaleDateString("sv-SE")} · {r.input.jurisdiction === "TW" ? T.tw[lang] : `${T.ny[lang]}, ${NY_REGION_LABEL[r.input.nyRegion ?? "nyc"]}`} · {zh ? "班表期間" : "Shifts"}{" "}
        {r.shifts[0]?.date} – {r.shifts.at(-1)?.date}
      </p>
      <table className="psum">
        <tbody>
          <tr>
            <th>{T.expected[lang]}</th>
            <td>{fmtMoney(c.expectedTotal, cur)}</td>
            <th>{T.paid[lang]}</th>
            <td>{c.paidTotal !== undefined ? fmtMoney(c.paidTotal, cur) : T.notFound[lang]}</td>
            <th>{T.diff[lang]}</th>
            <td>
              <b>{c.shortfall !== undefined ? fmtMoney(Math.max(0, c.shortfall), cur) : "n/a"}</b>
            </td>
          </tr>
        </tbody>
      </table>
      {rs.length > 0 && (
        <>
          <h2>{T.why[lang]}</h2>
          <ul>
            {rs.map((x, i) => (
              <li key={i}>
                {x[lang]}（{x.cite[lang]}）
              </li>
            ))}
          </ul>
        </>
      )}
      {r.premises.length > 0 && (
        <p className="pnote">
          {T.premises[lang]}：{r.premises.map((p) => p[lang]).join(" ")}
        </p>
      )}
      <h2>{T.lines[lang]}</h2>
      <table className="plines">
        <thead>
          <tr>
            <th>{T.date[lang]}</th>
            <th>{T.item[lang]}</th>
            <th>{T.hours[lang]}</th>
            <th>{T.rate[lang]}</th>
            <th>{T.payRule[lang]}</th>
            <th>{T.amount[lang]}</th>
            <th>{T.basis[lang]}</th>
          </tr>
        </thead>
        <tbody>
          {c.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.date}</td>
              <td>{lineLabel(l, lang)}</td>
              <td>{l.hours}</td>
              <td>{fmtMoney(l.baseRate, cur, true)}</td>
              <td>{lineRateWords(l, cur, lang)}</td>
              <td>{fmtMoney(l.amount, cur, true)}</td>
              <td>{lineRuleKeys(l).map((k) => citeOf(k, lang)).join("; ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>{zh ? "官方出處" : "Official sources"}</h2>
      <ul className="psrc">
        {used.map((x, i) => (
          <li key={i}>
            {ruleTitle(x.key, lang)}（{citeOf(x.key, lang)}）：{ruleValueWords(x, cur, lang)}
            {x.effectiveFrom ? (zh ? `，${x.effectiveFrom} 起` : `, from ${x.effectiveFrom}`) : ""}。「{shorten(x.citations[0]?.quote ?? "", 90)}」 {x.citations[0]?.url}
          </li>
        ))}
        {usedHolidays(r).map((h, i) => (
          <li key={`h${i}`}>
            {T.holidayTitle[lang]} {h.name} {holidayLabel(h, r.shifts)}：「{shorten(h.citations[0]?.quote ?? "", 40)}」 {h.citations[0]?.url}
          </li>
        ))}
      </ul>
      <p className="pnote">{zh ? DISCLAIMER_ZH : r.disclaimer} {zh ? "所有數字由程式依上列官方條文計算。" : "All amounts computed by code from the official text above."}</p>
    </div>
  );
}

export default function FairShift({ initialMode, initialNote }: { initialMode: "live" | "mock"; initialNote: string }) {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("TW");
  const [lang, setLang] = useState<Lang>("zh");
  const [region, setRegion] = useState<NyRegion>("nyc");
  const [job, setJob] = useState<NyJob>("general");
  const hero = EVAL_CASES.find((x) => x.id === HERO_SAMPLE)!;
  const [schedule, setSchedule] = useState(hero.input.scheduleText);
  const [payslip, setPayslip] = useState(hero.input.payslipText);
  const [restDay, setRestDay] = useState<string>(String(hero.input.restDayWeekday));
  const [dayOff, setDayOff] = useState<string>(String(hero.input.dayOffWeekday));
  const [askDays, setAskDays] = useState(false);
  /** Days came from a sample, not from the person: editing the schedule asks again. */
  const [daysFromSample, setDaysFromSample] = useState(true);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [traceOpen, setTraceOpen] = useState(true);
  const [report, setReport] = useState<FairShiftReport | null>(null);
  const [reportTitle, setReportTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState({ mode: initialMode, note: initialNote });
  const [copied, setCopied] = useState(false);
  const verdictRef = useRef<HTMLElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);

  const samples = useMemo(() => EVAL_CASES.filter((c) => c.input.jurisdiction === jurisdiction), [jurisdiction]);

  function switchJurisdiction(j: Jurisdiction) {
    setJurisdiction(j);
    setLang(j === "TW" ? "zh" : "en");
  }

  const dayValue = (v: number | null | undefined) => (typeof v === "number" ? String(v) : "none");

  function fill(c: EvalCase) {
    switchJurisdiction(c.input.jurisdiction);
    if (c.input.nyRegion) setRegion(c.input.nyRegion);
    setJob(c.input.nyJob ?? "general");
    setSchedule(c.input.scheduleText);
    setPayslip(c.input.payslipText);
    setRestDay(dayValue(c.input.restDayWeekday));
    setDayOff(dayValue(c.input.dayOffWeekday));
    setDaysFromSample(true);
    setAskDays(false);
    setReport(null);
    setSteps([]);
  }

  async function trySample() {
    fill(hero);
    await run({ ...hero.input }, lang === "zh" ? "範例：台北店員國慶日上班，只拿到原時薪" : `Sample: ${hero.title}`);
  }

  function currentInput(): CheckInput {
    const day = (v: string) => (v === "none" ? null : v === "" ? undefined : Number(v));
    return {
      jurisdiction,
      nyRegion: jurisdiction === "US-NY" ? region : undefined,
      nyJob: jurisdiction === "US-NY" ? job : undefined,
      scheduleText: schedule,
      payslipText: payslip,
      restDayWeekday: jurisdiction === "TW" ? day(restDay) : undefined,
      dayOffWeekday: jurisdiction === "TW" ? day(dayOff) : undefined,
    };
  }

  function checkOwn() {
    if (jurisdiction === "TW" && (restDay === "" || dayOff === "")) {
      setAskDays(true);
      requestAnimationFrame(() => daysRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setAskDays(false);
    void run();
  }

  async function run(input: CheckInput = currentInput(), title: string | null = null) {
    setBusy(true);
    setError(null);
    setReport(null);
    setReportTitle(title);
    setSteps([]);
    setTraceOpen(true);
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
            setTraceOpen(false);
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
  const rs = report && c ? reasons(c, report.shifts, report.rules) : [];
  const split = report ? splitRules(report) : null;
  const hols = report ? usedHolidays(report) : [];
  const rb = report?.recordedBy;
  const recordedText =
    rb &&
    (lang === "zh"
      ? `代理自己記錄 ${rb.agentRules} 條規定、${rb.agentHolidays} 個假日；程式補上 ${rb.fallbackRules + rb.fallbackHolidays} 項`
      : `the agent recorded ${rb.agentRules} rule(s) and ${rb.agentHolidays} holiday(s); code filled ${rb.fallbackRules + rb.fallbackHolidays}`);
  const zhUI = lang === "zh";

  return (
    <>
      <div className="shell screen" lang={zhUI ? "zh-Hant" : "en"}>
        <header className="top">
          <div>
            <p className="eyebrow">{T.eyebrow[lang]}</p>
            <h1>Fair Shift</h1>
            <p className="lede">{T.lede[lang]}</p>
            <div className="cta">
              <button className="go big" onClick={trySample} disabled={busy}>
                {busy ? <Loader2 className="spin" size={18} aria-hidden /> : <Play size={18} aria-hidden />}
                {T.trySample[lang]}
              </button>
              <span className="muted">{T.sampleNote[lang]}</span>
            </div>
          </div>
          <div className="topright">
            <button className="langbtn" onClick={() => setLang(zhUI ? "en" : "zh")} aria-label={zhUI ? "Switch to English" : "切換成中文"}>
              <Languages size={15} aria-hidden /> {zhUI ? "English" : "中文"}
            </button>
            <span className={`badge ${mode.mode}`} title={mode.note}>
              {mode.mode === "live" ? T.live[lang] : T.demo[lang]}
            </span>
          </div>
        </header>
        {demo && (
          <p className="banner">
            <Info size={15} aria-hidden /> {mode.note}
          </p>
        )}

        {report?.parseError && (
          <section className="verdict bad" ref={verdictRef} aria-live="polite">
            <h2 className="vhead small-head">
              <AlertTriangle size={24} aria-hidden /> {T.cantRead[lang]}
            </h2>
            <p>{report.parseError[lang]}</p>
            {report.parseError.unread.length > 0 && (
              <>
                <p className="muted">{T.unreadLines[lang]}</p>
                <pre className="msg">{report.parseError.unread.join("\n")}</pre>
              </>
            )}
          </section>
        )}

        {report && c && !report.parseError && (
          <section className={`verdict ${gap > 0 ? "bad" : "good"}`} ref={verdictRef} aria-live="polite">
            <p className="kicker">
              {reportTitle ?? T.yourCheck[lang]}
              {demo && <span className="tag">{T.demo[lang]}</span>}
              {report.parse.confidence === "low" && <span className="tag">{T.lowConf[lang]}</span>}
            </p>
            <h2 className="vhead">
              {c.shortfall === undefined ? (
                <>
                  {T.expectedOnly[lang]} {fmtMoney(c.expectedTotal, cur)}
                </>
              ) : gap > 0 ? (
                <>
                  {T.underpaid[lang]} {fmtMoney(gap, cur)}
                </>
              ) : (
                <>
                  <CheckCircle2 size={28} aria-hidden /> {T.noGap[lang]}
                </>
              )}
            </h2>
            <p className="vsub">
              {zhUI
                ? `應領 ${fmtMoney(c.expectedTotal, cur)}${c.paidTotal !== undefined ? `，實領 ${fmtMoney(c.paidTotal, cur)}` : "，薪資單上找不到實領金額"}。共 ${report.shifts.length} 個班、${c.workedHours} 小時。`
                : `Expected ${fmtMoney(c.expectedTotal, cur)}${c.paidTotal !== undefined ? `, paid ${fmtMoney(c.paidTotal, cur)}` : ", no total found on the payslip"}. ${c.workedHours} hours across ${report.shifts.length} shift(s).`}
            </p>
            {report.premises.length > 0 && (
              <div className="premise">
                <b>
                  <Info size={14} aria-hidden /> {T.premises[lang]}
                </b>
                <ul>
                  {report.premises.map((p, i) => (
                    <li key={i}>{p[lang]}</li>
                  ))}
                </ul>
              </div>
            )}
            {rs.length > 0 && (
              <>
                <h3 className="vrules-h">{T.why[lang]}</h3>
                <ul className="vfind">
                  {rs.map((w, i) => (
                    <li key={i}>
                      <AlertTriangle size={14} aria-hidden />
                      <span>
                        {w[lang]}
                        <small className="cite">{w.cite[lang]}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {split && (split.used.length > 0 || hols.length > 0) && (
              <>
                <h3 className="vrules-h">
                  <Landmark size={15} aria-hidden /> {T.rulesBehind[lang]}
                </h3>
                <div className="vrules">
                  {hols.slice(0, 2).map((h, i) => (
                    <MiniRule
                      key={`h${i}`}
                      title={`${T.holidayTitle[lang]}：${h.name}`}
                      value={holidayLabel(h, report.shifts)}
                      sub={zhUI ? "這天上班，工資加倍（勞動基準法第 39 條）" : "Working this day is paid double (LSA Art. 39)"}
                      cit={h.citations[0]}
                      lang={lang}
                    />
                  ))}
                  {split.used
                    .filter((r) => c.lines.some((l) => lineRuleKeys(l).includes(r.key)) || (r.key.endsWith("min_wage_hourly") && c.components.minWageTopUp > 0))
                    .slice(0, 4)
                    .map((r, i) => (
                      <MiniRule key={i} title={ruleTitle(r.key, lang)} sub={citeOf(r.key, lang)} value={ruleValueWords(r, cur, lang)} cit={r.citations[0]} lang={lang} />
                    ))}
                </div>
              </>
            )}
            {gap > 0 && <NextSteps j={report.input.jurisdiction} lang={lang} />}
            <div className="actions vactions">
              <button onClick={() => window.print()}>
                <Printer size={15} aria-hidden /> {T.print[lang]}
              </button>
              <a className="more" href="#details">
                <ArrowDown size={14} aria-hidden /> {T.more[lang]}
              </a>
            </div>
          </section>
        )}

        <section className="grid">
          <div className="card input">
            <h2>{T.checkOwn[lang]}</h2>
            <div className="seg" role="tablist" aria-label="Where you work">
              {(["TW", "US-NY"] as Jurisdiction[]).map((j) => (
                <button key={j} role="tab" aria-selected={jurisdiction === j} className={jurisdiction === j ? "on" : ""} onClick={() => switchJurisdiction(j)}>
                  {j === "TW" ? T.tw[lang] : T.ny[lang]}
                </button>
              ))}
            </div>
            {jurisdiction === "US-NY" ? (
              <div className="row2">
                <label className="field">
                  {T.region[lang]}
                  <select value={region} onChange={(e) => setRegion(e.target.value as NyRegion)}>
                    {(Object.keys(NY_REGION_LABEL) as NyRegion[]).map((r) => (
                      <option key={r} value={r}>
                        {NY_REGION_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  {T.job[lang]}
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
              <div ref={daysRef}>
                <div className={`row2 ${askDays ? "asking" : ""}`}>
                  <label className="field">
                    {T.restDay[lang]}
                    <select value={restDay} onChange={(e) => (setRestDay(e.target.value), setDaysFromSample(false))} aria-invalid={askDays && restDay === ""}>
                      <option value="">{T.choose[lang]}</option>
                      <option value="none">{T.notFixed[lang]}</option>
                      {WD[lang].map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {T.dayOff[lang]}
                    <select value={dayOff} onChange={(e) => (setDayOff(e.target.value), setDaysFromSample(false))} aria-invalid={askDays && dayOff === ""}>
                      <option value="">{T.choose[lang]}</option>
                      <option value="none">{T.notFixed[lang]}</option>
                      {WD[lang].map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {askDays && (
                  <p className="ask" role="alert">
                    <AlertTriangle size={15} aria-hidden /> {T.askDays[lang]}
                  </p>
                )}
              </div>
            )}
            <label className="field">
              {T.samples[lang]}
              <select
                value=""
                onChange={(e) => {
                  const s = EVAL_CASES.find((x) => x.id === e.target.value);
                  if (s) fill(s);
                }}
              >
                <option value="">{T.pickSample[lang]}</option>
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              {T.schedule[lang]}
              <textarea
                value={schedule}
                onChange={(e) => {
                  setSchedule(e.target.value);
                  if (jurisdiction === "TW" && daysFromSample) {
                    setRestDay("");
                    setDayOff("");
                    setDaysFromSample(false);
                  }
                }}
                rows={7}
                spellCheck={false}
                placeholder={jurisdiction === "TW" ? "10/5(一) 17:00-22:00　或　週五 18-22 休1小時" : "Mon Oct 5 9am-6pm (30 min break)"}
              />
            </label>
            <label className="field">
              {T.payslip[lang]}
              <textarea
                value={payslip}
                onChange={(e) => setPayslip(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder={jurisdiction === "TW" ? "薪資單 2026/10/01 - 2026/10/15 / 時薪 196 / 實發 4,312" : "Hourly rate: $17.00 / Gross pay: $722.50"}
              />
            </label>
            <p className="privacy">
              <Lock size={14} aria-hidden /> {T.privacy[lang]}
            </p>
            <button className="go" onClick={checkOwn} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} aria-hidden /> : <ShieldCheck size={18} aria-hidden />}
              {busy ? T.checking[lang] : T.check[lang]}
            </button>
            {error && (
              <p className="err" role="alert">
                <AlertTriangle size={16} aria-hidden /> {error}
              </p>
            )}
          </div>

          <details
            className="card trace"
            open={traceOpen}
            onToggle={(e) => setTraceOpen((e.target as HTMLDetailsElement).open)}
            aria-live="polite"
          >
            <summary>
              <h2>
                {T.agent[lang]}
                {steps.length > 0 && <span className="count"> ({steps.length})</span>} {demo && <span className="tag">{T.demo[lang]}</span>}
              </h2>
              {recordedText && <span className="muted small">{recordedText}</span>}
            </summary>
            {steps.length === 0 && !busy && <p className="muted">{T.agentEmpty[lang]}</p>}
            {demo && steps.length > 0 && <p className="muted small">{T.demoTrace[lang]}</p>}
            <ol>
              {steps.map((s, i) => (
                <li key={i} className={`step ${s.kind} ${/rejected|_error|step_limit|no_tool/.test(s.name) ? "rej" : ""}`}>
                  <StepIcon kind={s.kind} />
                  <span className="sname">{s.name}</span>
                  <span className="sdetail">{s.detail}</span>
                  {s.model && <span className="smodel">{s.model}</span>}
                </li>
              ))}
            </ol>
          </details>
        </section>

        {report && c && !report.parseError && split && (
          <section className="results" id="details">
            <div className="totals">
              <div className="tot">
                <span>{T.expected[lang]}</span>
                <strong>{fmtMoney(c.expectedTotal, cur)}</strong>
              </div>
              <div className="tot">
                <span>{T.paid[lang]}</span>
                <strong>{c.paidTotal !== undefined ? fmtMoney(c.paidTotal, cur) : T.notFound[lang]}</strong>
              </div>
              <div className={`tot big ${gap > 0 ? "bad" : "good"}`}>
                <span>{gap > 0 ? T.underpaid[lang] : T.diff[lang]}</span>
                <strong>{c.shortfall !== undefined ? fmtMoney(Math.max(0, gap), cur) : "n/a"}</strong>
              </div>
            </div>

            <div className="card">
              <h2>{T.lines[lang]}</h2>
              <p className="muted">
                {zhUI
                  ? `共 ${report.shifts.length} 個班、${c.workedHours} 小時。班表由${report.parse.source === "model" ? ` ${report.parse.model} 讀取，並和規則解析交叉比對` : "規則解析器讀取"}。`
                  : `${report.shifts.length} shift(s), ${c.workedHours} hours. Read by ${report.parse.source === "model" ? report.parse.model : "the rule-based parser"}. ${report.parse.crossCheck}`}
              </p>
              <div className="tablewrap">
                <table className="lines">
                  <thead>
                    <tr>
                      <th>{T.date[lang]}</th>
                      <th>{T.item[lang]}</th>
                      <th>{T.hours[lang]}</th>
                      <th>{T.rate[lang]}</th>
                      <th>{T.payRule[lang]}</th>
                      <th>{T.amount[lang]}</th>
                      <th>{T.basis[lang]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.lines.map((l, i) => {
                      const sh = report.shifts.find((s) => s.id === l.shiftId);
                      const note = lineNote(l, lang);
                      return (
                        <tr key={i} className={l.multiplier > 1 || l.label.startsWith("Spread") ? "prem" : ""}>
                          <td data-label={T.date[lang]}>
                            {l.date}
                            {sh && sh.dayType !== "workday" && <small>{sh.holidayName ?? sh.dayType.replace(/_/g, " ")}</small>}
                          </td>
                          <td data-label={T.item[lang]}>
                            {lineLabel(l, lang)}
                            {note && <small>{note}</small>}
                          </td>
                          <td data-label={T.hours[lang]}>{l.hours}</td>
                          <td data-label={T.rate[lang]}>{fmtMoney(l.baseRate, cur, true)}</td>
                          <td data-label={T.payRule[lang]}>{lineRateWords(l, cur, lang)}</td>
                          <td data-label={T.amount[lang]} className="amt">
                            {fmtMoney(l.amount, cur, true)}
                          </td>
                          <td data-label={T.basis[lang]}>
                            {lineRuleKeys(l).map((k) => (
                              <a key={k} className="rk" href={`#rule-${k}`}>
                                {citeOf(k, lang)}
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

            <div className="card two">
              <div>
                <h2>{T.plain[lang]}</h2>
                <p>{zhUI ? (report.explanation.textZh ?? report.explanation.text) : report.explanation.text}</p>
                {c.assumptions.length > 0 && (
                  <details>
                    <summary>
                      <h3>{T.assumptions[lang]}</h3>
                    </summary>
                    <ul className="assume">
                      {(zhUI ? c.assumptionsZh : c.assumptions).map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <div>
                <h2>{T.msg[lang]}</h2>
                <pre className="msg">{report.explanation.messageToEmployer}</pre>
                <div className="actions">
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(report.explanation.messageToEmployer);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    <Copy size={15} aria-hidden /> {copied ? T.copied[lang] : T.copy[lang]}
                  </button>
                  <button onClick={() => window.print()}>
                    <Printer size={15} aria-hidden /> {T.print[lang]}
                  </button>
                  <button onClick={() => download(`fair-shift-${report.id}.md`, toMarkdown(report, lang), "text/markdown")}>
                    <FileText size={15} aria-hidden /> Markdown
                  </button>
                  <button onClick={() => download(`fair-shift-${report.id}.json`, JSON.stringify(report, null, 2), "application/json")}>
                    <Download size={15} aria-hidden /> JSON
                  </button>
                </div>
              </div>
            </div>

            <details className="card">
              <summary>
                <h2>{T.rulesUsed[lang]}</h2>
                <span className="muted small">{recordedText}</span>
              </summary>
              <p className="muted">{T.rulesNote[lang]}</p>
              <div className="rules">
                {split.used.map((r, i) => (
                  <RuleCard key={i} r={r} lang={lang} cur={cur} demo={demo} />
                ))}
                {hols.map((h, i) => (
                  <article key={`h${i}`} className="rule">
                    <header>
                      <h3>
                        {T.holidayTitle[lang]}：{h.name}
                        <small>{h.recordedBy === "agent" ? T.byAgent[lang] : T.byCode[lang]}</small>
                      </h3>
                      <span className="val">{holidayLabel(h, report.shifts)}</span>
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
                          <Via c={ci} lang={lang} />
                        </figcaption>
                      </figure>
                    ))}
                  </article>
                ))}
              </div>
              {split.other.length > 0 && (
                <details className="otherrules">
                  <summary>
                    <h3>
                      {T.otherRules[lang]} ({split.other.length})
                    </h3>
                  </summary>
                  <div className="rules">
                    {split.other.map((o, i) => (
                      <RuleCard key={i} r={o.rule} lang={lang} cur={cur} demo={demo} note={o.why[lang]} />
                    ))}
                  </div>
                </details>
              )}
            </details>

            <div className="card">
              <h2>{T.notChecked[lang]}</h2>
              <ul className="assume">
                {notChecked(report.input.jurisdiction).map((x, i) => (
                  <li key={i}>{x[lang]}</li>
                ))}
              </ul>
              {gap <= 0 && <NextSteps j={report.input.jurisdiction} lang={lang} />}
            </div>

            <p className="cost">
              {demo ? (
                <>{zhUI ? "示範模式：沒有呼叫任何付費模型或搜尋。" : "Demo mode: no paid model or search calls were made."} </>
              ) : zhUI ? (
                <>
                  這次核對：{report.usage.modelCalls} 次模型呼叫，約 US${report.usage.estCostUsd.toFixed(4)}，{report.usage.tavilyCredits} 個 Tavily 點數。模型：{report.modelsUsed.join("、")}。{" "}
                </>
              ) : (
                <>
                  This check: {report.usage.modelCalls} model call(s), about US${report.usage.estCostUsd.toFixed(4)}, {report.usage.tavilyCredits} Tavily credit(s). Models: {report.modelsUsed.join(", ")}.{" "}
                </>
              )}
              {report.redactions > 0 && (zhUI ? `送出前遮掉了 ${report.redactions} 項個人資料。` : `${report.redactions} personal detail(s) removed before sending.`)}
            </p>
            <p className="disclaimer">{zhUI ? DISCLAIMER_ZH : report.disclaimer}</p>
          </section>
        )}
      </div>
      {report && c && !report.parseError && <PrintReport r={report} lang={lang} />}
    </>
  );
}
