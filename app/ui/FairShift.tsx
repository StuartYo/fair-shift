"use client";

import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  Circle,
  CircleDot,
  ClipboardList,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  History,
  Info,
  Landmark,
  Languages,
  Loader2,
  Lock,
  MessageSquare,
  Phone,
  Play,
  Printer,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { type EvalCase } from "@/eval/cases";
import { SAMPLE_CASES } from "@/eval/samples";
import { NY_JOB_LABEL, NY_JOB_LABEL_ZH, NY_REGION_LABEL, NY_REGION_LABEL_ZH } from "@/lib/wage/catalog";
import { DAYTYPE_ZH } from "@/lib/wage/compute";
import { holidayNameEn, reasons } from "@/lib/wage/explain";
import { headlineOf } from "@/lib/wage/headline";
import { shiftCount } from "@/lib/wage/compute";
import { APP_VERSION } from "@/lib/version";
import { fmtMoney, holidayLabel, lineRateWords, ruleValueWords, toMarkdown } from "@/lib/wage/export";
import { citeOf, DISCLAIMER_ZH, lineLabel, lineNote, lineRuleKeys, nextSteps, notChecked, ruleTitle, splitRules, statusWords, type Lang } from "@/lib/wage/i18n";
import type { Alternative, CheckInput, FairShiftReport, HolidayRecord, Jurisdiction, NyJob, NyRegion, RuleRecord } from "@/lib/wage/types";
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
  sampleNote: { zh: "範例（虛構資料）：台北店員國慶日上班，只拿到原時薪。", en: "Sample (synthetic): a Taipei store clerk who worked National Day at straight time." },
  live: { zh: "線上模式", en: "Live" },
  demo: { zh: "示範模式", en: "Demo mode" },
  yourCheck: { zh: "你的核對結果", en: "Your check" },
  mayBeOwed: { zh: "依你輸入的資料，你可能少領了", en: "Based on what you entered, you may be owed" },
  expectedOnly: { zh: "應領", en: "Expected pay:" },
  noGap: { zh: "依你輸入的資料，沒有發現少領", en: "Based on what you entered, no underpayment found" },
  noPaid: {
    zh: "薪資單上沒讀到實領或應發金額，所以沒有算差額。把金額貼進「薪資單」再核對一次。",
    en: "I could not find the amount paid on your payslip, so there is no difference to show. Add it to the payslip box and check again.",
  },
  premises: { zh: "這個數字的前提", en: "This number assumes" },
  lowConf: { zh: "班表讀取不確定", en: "Schedule read with low confidence" },
  twoWays: { zh: "同一份資料有兩種算法", en: "Two ways to count the same input" },
  thisResult: { zh: "上面的結果", en: "The result above" },
  why: { zh: "差在哪裡", en: "Why" },
  rulesBehind: { zh: "這個數字依據的規定", en: "The rules behind this number" },
  next: { zh: "接下來可以怎麼做", en: "What you can do next" },
  more: { zh: "逐行計算、所有出處、給雇主的訊息", en: "Every line, every source, and a message to your employer" },
  checkOwn: { zh: "核對自己的薪水", en: "Check your own pay" },
  tw: { zh: "台灣", en: "Taiwan" },
  ny: { zh: "紐約", en: "New York" },
  region: { zh: "地區", en: "Region" },
  job: { zh: "工作類型", en: "Job" },
  tipsQ: { zh: "薪資單上的總額（Gross pay）含小費嗎？", en: "Does the gross pay on your payslip include your tips?" },
  tipsUnsure: { zh: "不確定（兩種都算給我看）", en: "Not sure (show both)" },
  tipsNo: { zh: "不含，只有工資", en: "No, wages only" },
  tipsYes: { zh: "含小費", en: "Yes, it includes tips" },
  restDay: { zh: "休息日", en: "Rest day (休息日)" },
  dayOff: { zh: "例假", en: "Regular day off (例假)" },
  dayHelp: {
    zh: "例假＝每 7 天一定要放的那一天；休息日＝每週另一天休息，那天上班加班費比較高。這兩天由雇主排定，不知道就選「不固定／不知道」。",
    en: "Regular day off (例假) = the one day in every 7 that must be off. Rest day (休息日) = the second day off each week; work on it pays more. Your employer sets both. Not sure? Choose “Not fixed / not sure”.",
  },
  choose: { zh: "請選擇", en: "Choose" },
  notFixed: { zh: "不固定／不知道", en: "Not fixed / not sure" },
  askDays: {
    zh: "先告訴我你的休息日和例假是星期幾。這會改變金額：同一天上班，算休息日和算國定假日差很多。不確定就選「不固定／不知道」。",
    en: "Tell me your rest day and regular day off first. It changes the amount: the same shift is paid differently on a rest day and on a holiday. If you are not sure, choose “Not fixed / not sure”.",
  },
  sampleTag: { zh: "範例值", en: "sample value" },
  sampleBox: { zh: "下面填的是範例（虛構資料），不是你的資料。換成你自己的再核對。", en: "These boxes hold a sample (synthetic data), not yours. Replace it with your own to check your pay." },
  samples: { zh: "其他範例（皆為虛構資料）", en: "More samples (all synthetic)" },
  pickSample: { zh: "選一個範例…", en: "Pick a sample…" },
  schedule: { zh: "班表或打卡紀錄", en: "Schedule or timesheet" },
  payslip: { zh: "薪資單", en: "Payslip" },
  rate: { zh: "時薪", en: "Hourly rate" },
  rateHelp: { zh: "薪資單上沒寫時薪才需要填。", en: "Only if the payslip does not show it." },
  privacyShort: { zh: "貼上前先把姓名蓋掉。內容不會被儲存。", en: "Cover names before pasting. Nothing you paste is stored." },
  privacy: {
    zh: "送出前會先遮掉姓名、身分證字號、電話、Email、帳號、店名和統編，再交給模型或搜尋。Fair Shift 不儲存、也不記錄你貼上的內容；主機只留一般連線紀錄（時間、路徑、IP），不含內容。遮蔽不一定抓得到所有名字。結果頁的「這個結果對嗎？」只會記下你的答案、選填留言、頁面語言和版本號，不含班表或薪資單。",
    en: "Names, ID numbers, phones, emails, account numbers, shop names and tax IDs are removed before anything reaches a model or a search API. Fair Shift does not store or log what you paste; the host keeps ordinary request logs (time, path, IP), not the text. The filter can miss a name. The \"Was this right?\" button on the result logs only your answer, an optional comment, the page language and the app version, never the schedule or payslip.",
  },
  check: { zh: "核對我的薪水", en: "Check my pay" },
  checking: { zh: "核對中", en: "Checking" },
  usually: { zh: "通常要 15 到 30 秒", en: "Usually 15 to 30 seconds" },
  seeSteps: { zh: "每一步都會即時列在「代理做了什麼」。", en: "Each step appears live under “What the agent did”." },
  agent: { zh: "代理做了什麼", en: "What the agent did" },
  how: { zh: "一次核對會做這些事", en: "What a check does" },
  demoTrace: { zh: "示範模式：模型由腳本代替，網頁是存檔；下面每一個檢查都是真的程式。", en: "Scripted stand-in for the model; pages are saved copies. Every check below is the real code." },
  expected: { zh: "應領", en: "Expected" },
  paid: { zh: "實領", en: "Paid" },
  diff: { zh: "差額", en: "Difference" },
  notFound: { zh: "找不到", en: "Not found" },
  lines: { zh: "逐行計算", en: "Line by line" },
  date: { zh: "日期", en: "Date" },
  item: { zh: "項目", en: "Item" },
  hours: { zh: "時數", en: "Hours" },
  payRule: { zh: "算法", en: "Pay rule" },
  amount: { zh: "金額", en: "Amount" },
  basis: { zh: "依據", en: "Rule" },
  rulesUsed: { zh: "用到的官方規定（含原文）", en: "Official rules used (with the exact text)" },
  rulesNote: {
    zh: "下面每個數值都是程式從引文讀出來的，引文必須和這次取得的官方網頁一字不差。沒有任何數字來自模型的記憶。每段引文旁邊標出它是怎麼取得的。",
    en: "Every value below was read by code from the quoted text, and every quote matches an official page retrieved for this check word for word. Nothing comes from model memory. Each quote says how its page was retrieved.",
  },
  otherRules: { zh: "這次也取得、但沒用到的規定", en: "Also retrieved, not used for these shifts" },
  byAgent: { zh: "代理自己記錄", en: "Recorded by the agent" },
  byCode: { zh: "代理沒記到，程式從取得的原文讀出", en: "Agent missed it; code read it from the retrieved text" },
  plain: { zh: "白話說明", en: "In plain words" },
  assumptions: { zh: "計算時的假設", en: "Assumptions" },
  msg: { zh: "給雇主的訊息", en: "Message to your employer" },
  msgZhNote: { zh: "", en: "Written in Chinese for an employer in Taiwan. English translation below." },
  msgEnNote: { zh: "這封是寫給紐約雇主的英文訊息，中文翻譯在下面。", en: "" },
  translation: { zh: "中文翻譯", en: "English translation" },
  copy: { zh: "複製訊息", en: "Copy message" },
  copied: { zh: "已複製", en: "Copied" },
  print: { zh: "列印一頁式報告／存成 PDF", en: "Print one-page report / save as PDF" },
  notChecked: { zh: "這個工具沒有檢查的事", en: "What this tool does not check" },
  holidayTitle: { zh: "國定假日", en: "National holiday" },
  saved: { zh: "存檔（示範模式）", en: "Saved copy (demo mode)" },
  viaExtract: { zh: "這次用 Tavily extract 讀取", en: "Read live with Tavily extract" },
  viaSearchPage: { zh: "Tavily search 找到這頁、用 extract 讀取", en: "Found by Tavily search, read with Tavily extract" },
  viaSearch: { zh: "Tavily search 搜尋結果", en: "Tavily search result" },
  freshness: { zh: "新舊檢查（Tavily search）", en: "Freshness check (Tavily search)" },
  searched: { zh: "搜尋", en: "Searched" },
  onSites: { zh: "範圍", en: "on" },
  cantRead: { zh: "問題在班表", en: "The problem is in the schedule" },
  needRate: { zh: "薪資單需要時薪", en: "The payslip needs an hourly rate" },
  addRate: { zh: "填上時薪", en: "Enter the hourly rate" },
  unreadLines: { zh: "沒讀懂的行：", en: "Lines I could not read:" },
  savedResult: { zh: "存檔結果", en: "Saved result" },
  upTo: { zh: "依你輸入的資料，你最多可能少領", en: "Based on what you entered, you may be owed up to" },
  netSmall: { zh: "只看到實領，這個差額可能只是扣款", en: "Only take-home pay found: this gap may just be deductions" },
  breakTag: { zh: "金額取決於休息時間", en: "Depends on your breaks" },
  alsoCheck: { zh: "也值得確認", en: "Also worth checking" },
  vizTitle: { zh: "差額怎麼來的", en: "Where the gap comes from" },
  vizBase: { zh: "照時薪算的工資", en: "Pay at your rate" },
  vizTopUp: { zh: "補到最低工資", en: "Top-up to the minimum wage" },
  vizExtra: { zh: "規定要另外加給的", en: "Extra pay the rules add" },
  vizPaid: { zh: "薪資單上的金額", en: "On your payslip" },
  vizGap: { zh: "差額", en: "Gap" },
  vizExpected: { zh: "依規定應領", en: "Expected under the rules" },
  schedHelp: {
    zh: "寫法：一行一班，例如「10/5 17:00-22:00」。有休息就寫「休1小時」（9 點到 6 點的班通常有）；跨午夜照寫「22:00-02:00」；同一天兩段寫在同一行「10/5 08-12 17-21」。沒寫下班時間（例如「到打烊」）的班讀不到。",
    en: "One shift per line, like \"10/5 17:00-22:00\". Write breaks (\"30 min break\" or 休1小時; a 9-to-6 shift usually has one). A night shift is just \"22:00-02:00\". Two shifts on one day can share a line: \"10/5 08-12 17-21\". A shift with no end time (\"until close\") cannot be read.",
  },
  slipHelp: {
    zh: "有「應發」就貼應發（扣款前的金額）；只有「實領」也可以，但差額可能是勞保、健保。時薪寫「時薪 196」或「每小時196元」都可以。",
    en: "Paste the gross amount if there is one (before deductions); take-home pay alone works, but the gap may be insurance or tax. \"Hourly rate $17\", \"$17/hr\" or \"17.00 per hour\" all work.",
  },
  checkAgain: { zh: "用這個時薪再核對", en: "Check again with this rate" },
  rateSuggest: { zh: "薪資單金額 ÷ 時數 =", en: "Payslip amount ÷ hours =" },
  continued: { zh: "接續前一天的夜班", en: "night shift continued" },
  fbQ: { zh: "這個結果對嗎？", en: "Was this right?" },
  fbYes: { zh: "對", en: "Yes" },
  fbNo: { zh: "不對", en: "No" },
  fbUnsure: { zh: "不確定", en: "Not sure" },
  fbPlaceholder: { zh: "哪裡不對或看不懂？（選填，300 字內，請不要寫姓名、店名或薪水金額）", en: "What was wrong or confusing? (optional, up to 300 characters; no names, shop names or pay amounts)" },
  fbSend: { zh: "送出", en: "Send" },
  fbThanks: { zh: "收到了，謝謝！", en: "Thanks, got it." },
  fbNote: {
    zh: "只會送出你選的答案、這段留言、頁面語言和版本號。班表、薪資單和結果都不會送出。",
    en: "Only your answer, this comment, the page language and the app version are sent. Not your schedule, payslip or result.",
  },
} satisfies Record<string, Record<Lang, string>>;

/**
 * The stages of a check. A stage is running once a step that starts it has
 * streamed in, and done once a step that ends it has. Stages overlap: the
 * schedule is read while the pages are fetched and the agent works.
 */
const STAGES: { zh: string; en: string; starts: RegExp | null; ends: RegExp | null }[] = [
  { zh: "讀班表和薪資單（Nemotron Nano＋規則解析）", en: "Read the schedule and payslip (Nemotron Nano + rule parser)", starts: null, ends: /^(parse|no_shifts|needs_hourly_rate)$/ },
  { zh: "到政府網站讀規定（Tavily extract＋search）", en: "Read the rules on government sites (Tavily extract + search)", starts: /^(fetch_official|search_official)$/, ends: /^fetch_pages$/ },
  { zh: "代理記錄規定，程式逐字檢查引文（Nemotron Super）", en: "Agent records the rules, code checks every quote (Nemotron Super)", starts: /^agent$/, ends: /^recorded$/ },
  { zh: "程式算錢", en: "Code computes the pay", starts: /^recorded$/, ends: /^compute$/ },
  { zh: "寫白話說明（Nemotron Ultra）", en: "Write the plain-language explanation (Nemotron Ultra)", starts: /^compute$/, ends: null },
];

const STEP_ZH: Record<string, string> = {
  redact: "遮蔽個資",
  parse: "讀班表",
  json: "模型",
  agent: "代理",
  fetch_official: "讀官方網頁",
  fetch_pages: "讀官方網頁",
  search_official: "搜尋官方網站",
  record_rules: "記錄規定",
  rule_rejected: "引文被退回",
  holiday_rejected: "假日被退回",
  auto_finish: "完成",
  finish: "完成",
  recorded: "記錄結果",
  code_fallback: "程式補上",
  status_update: "狀態更新",
  compute: "算錢",
  no_shifts: "沒讀到班",
  needs_hourly_rate: "缺時薪",
  time_stop: "時間到",
  budget_stop: "預算到",
  explanation_rejected: "說明被退回",
};

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

/** How the page behind a quote was retrieved: saved copy, seed page read with extract, page found by search, or a search snippet. */
function Via({ c, lang }: { c: Citation; lang: Lang }) {
  const label = c.via.startsWith("fixture")
    ? T.saved[lang]
    : c.via === "tavily_search"
      ? T.viaSearch[lang]
      : c.foundBy === "search"
        ? T.viaSearchPage[lang]
        : T.viaExtract[lang];
  return <span className={`via ${c.foundBy === "search" || c.via === "tavily_search" ? "fromsearch" : ""}`}>{label}</span>;
}

/** Holidays that made a shift a holiday shift in this result. */
function usedHolidays(r: FairShiftReport): HolidayRecord[] {
  return r.holidays.filter((h) => r.shifts.some((s) => s.dayType === "holiday" && (h.date ? h.date === s.date : h.monthDay === s.date.slice(5))));
}

const holidayName = (name: string, lang: Lang) => (lang === "zh" ? name : holidayNameEn(name));

function MiniRule({ title, sub, value, cit, lang, status }: { title: string; sub?: string; value: string; cit?: Citation; lang: Lang; status?: string }) {
  return (
    <article className="mini">
      <header>
        <h3>
          {title}
          {sub && <small>{sub}</small>}
        </h3>
        <span className="val">{value}</span>
      </header>
      {status && <p className="minist warn">{status}</p>}
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

function RuleCard({ r, lang, cur, note }: { r: RuleRecord; lang: Lang; cur: "TWD" | "USD"; note?: string }) {
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
        {r.region && <>{lang === "zh" ? NY_REGION_LABEL_ZH[r.region] : NY_REGION_LABEL[r.region]}. </>}
        {r.variant && <>{lang === "zh" ? NY_JOB_LABEL_ZH[r.variant] : NY_JOB_LABEL[r.variant]}. </>}
        {note ? <span className="warn">{note}</span> : <span className={r.status === "in_force" ? "ok" : "warn"}>{statusWords(r, lang)}</span>}
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
            <Via c={ci} lang={lang} />
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

/** The main reading and the other reading of the same input, side by side. */
function Compare({ a, main, lang, cur }: { a: Alternative; main: FairShiftReport["computation"]; lang: Lang; cur: "TWD" | "USD" }) {
  const owed = (s: number | undefined, e: number) =>
    s === undefined ? `${T.expected[lang]} ${fmtMoney(e, cur)}` : s > 0 ? `${lang === "zh" ? "可能少領" : "May be owed"} ${fmtMoney(s, cur)}` : lang === "zh" ? "沒有少領" : "No underpayment";
  return (
    <div className="compare" role="group" aria-label={T.twoWays[lang]}>
      <h3>{T.twoWays[lang]}</h3>
      <div className="cmpgrid">
        <div className="cmp on">
          <span className="cmplabel">{T.thisResult[lang]}</span>
          <p>{a.primary[lang]}</p>
          <strong>{owed(main.shortfall, main.expectedTotal)}</strong>
          <small>
            {T.expected[lang]} {fmtMoney(main.expectedTotal, cur)}
          </small>
        </div>
        <div className="cmp">
          <span className="cmplabel">{lang === "zh" ? "另一種算法" : "The other reading"}</span>
          <p>{a.alt[lang]}</p>
          <strong>{owed(a.shortfall, a.expectedTotal)}</strong>
          <small>
            {T.expected[lang]} {fmtMoney(a.expectedTotal, cur)}
            {a.paidTotal !== undefined && main.paidTotal !== a.paidTotal ? ` · ${T.paid[lang]} ${fmtMoney(a.paidTotal, cur)}` : ""}
          </small>
        </div>
      </div>
    </div>
  );
}

function Stages({ steps, busy, lang, elapsed }: { steps: TraceStep[]; busy: boolean; lang: Lang; elapsed: number }) {
  const seen = (re: RegExp | null) => (re ? steps.some((t) => re.test(t.name)) : false);
  const running = busy || steps.length > 0;
  return (
    <ol className="stages">
      {STAGES.map((s, i) => {
        const started = running && (s.starts === null || seen(s.starts));
        const done = started && (s.ends ? seen(s.ends) : !busy);
        const now = busy && started && !done;
        return (
          <li key={i} className={done ? "done" : now ? "now" : ""}>
            {done ? <CheckCircle2 size={15} aria-hidden /> : now ? <Loader2 className="spin" size={15} aria-hidden /> : <Circle size={15} aria-hidden />}
            <span>{s[lang]}</span>
            {now && <small>{Math.round(elapsed)} s</small>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The gap as one picture: what the rules say you should get (pay at your rate,
 * any top-up to the minimum wage, then each extra the rules add) on top, and
 * the payslip below on the same scale, with the gap marked.
 */
const REASON_SHORT: Partial<Record<string, Record<Lang, string>>> = {
  holiday: { zh: "國定假日加倍", en: "Holiday double pay" },
  day_off: { zh: "例假加倍", en: "Day-off double pay" },
  rest_day: { zh: "休息日加給", en: "Rest day pay" },
  weekly_ot: { zh: "超過每週 40 小時的加班費", en: "Overtime over 40 a week" },
  daily_ot: { zh: "加班費（一天超過 8 小時）", en: "Overtime (over 8 a day)" },
  ny_tipped_ot: { zh: "小費員工加班費", en: "Tipped overtime" },
  ny_ot: { zh: "加班費", en: "Overtime" },
  spread: { zh: "工時跨度加給", en: "Spread of hours" },
};

function GapBar({ r, lang }: { r: FairShiftReport; lang: Lang }) {
  const c = r.computation;
  const cur = c.currency;
  if (c.paidTotal === undefined || c.expectedTotal <= 0) return null;
  const rs = reasons(c, r.shifts, r.rules).filter((x) => x.kind !== "min_wage" && x.kind !== "unpaid_hours" && x.kind !== "tip_makeup" && (x.amount ?? 0) > 0);
  const extra = rs.reduce((a, x) => a + (x.amount ?? 0), 0);
  const topUp = Math.max(0, c.components.minWageTopUp);
  const base = Math.max(0, c.expectedTotal - extra - topUp);
  const max = Math.max(c.expectedTotal, c.paidTotal);
  const w = (n: number) => `${Math.max(0, (n / max) * 100)}%`;
  const gap = Math.max(0, c.expectedTotal - c.paidTotal);
  const segs = [
    { k: "base", label: T.vizBase[lang], amount: base },
    ...(topUp > 0.005 ? [{ k: "topup", label: T.vizTopUp[lang], amount: topUp }] : []),
    ...rs.map((x, i) => ({ k: `x${i}`, label: REASON_SHORT[x.kind]?.[lang] ?? x[lang].slice(0, 30), amount: x.amount ?? 0 })),
  ].filter((x) => x.amount > 0.005);
  return (
    <figure className="gapviz" aria-label={T.vizTitle[lang]}>
      <figcaption>{T.vizTitle[lang]}</figcaption>
      <div className="gaprow">
        <span className="gaplabel">{T.vizExpected[lang]}</span>
        <div className="gaptrack">
          {segs.map((x) => (
            <span key={x.k} className={`gapseg ${x.k === "base" ? "base" : x.k === "topup" ? "topup" : "extra"}`} style={{ width: w(x.amount) }} title={`${x.label}: ${fmtMoney(x.amount, cur)}`} />
          ))}
        </div>
        <span className="gapval">{fmtMoney(c.expectedTotal, cur)}</span>
      </div>
      <div className="gaprow">
        <span className="gaplabel">{T.vizPaid[lang]}</span>
        <div className="gaptrack">
          <span className="gapseg paid" style={{ width: w(c.paidTotal) }} title={`${T.vizPaid[lang]}: ${fmtMoney(c.paidTotal, cur)}`} />
          {gap > 0.005 && <span className="gapseg gap" style={{ width: w(gap) }} title={`${T.vizGap[lang]}: ${fmtMoney(gap, cur)}`} />}
        </div>
        <span className="gapval">{fmtMoney(c.paidTotal, cur)}</span>
      </div>
      <ul className="gaplegend">
        {segs.map((x) => (
          <li key={x.k}>
            <i className={`sw ${x.k === "base" ? "base" : x.k === "topup" ? "topup" : "extra"}`} aria-hidden />
            {x.label} {fmtMoney(x.amount, cur)}
          </li>
        ))}
        {gap > 0.005 && (
          <li>
            <i className="sw gap" aria-hidden />
            {T.vizGap[lang]} {fmtMoney(gap, cur)}
          </li>
        )}
      </ul>
    </figure>
  );
}

/** "Was this right?": sends only the answer, an optional comment, the language and the app version. */
function Feedback({ lang, reportId }: { lang: Lang; reportId: string }) {
  const [answer, setAnswer] = useState<"yes" | "no" | "unsure" | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  useEffect(() => {
    setAnswer(null);
    setComment("");
    setState("idle");
  }, [reportId]);
  async function send() {
    if (!answer) return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, comment: comment.trim() || undefined, lang, version: APP_VERSION }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }
  if (state === "sent")
    return (
      <p className="fb sent" role="status">
        <CheckCircle2 size={15} aria-hidden /> {T.fbThanks[lang]}
      </p>
    );
  return (
    <div className="fb" role="group" aria-label={T.fbQ[lang]}>
      <p className="fbq">
        <MessageSquare size={15} aria-hidden /> <b>{T.fbQ[lang]}</b>
      </p>
      <div className="fbbtns">
        {(["yes", "no", "unsure"] as const).map((a) => (
          <button key={a} className={answer === a ? "on" : ""} aria-pressed={answer === a} onClick={() => setAnswer(a)}>
            {a === "yes" ? T.fbYes[lang] : a === "no" ? T.fbNo[lang] : T.fbUnsure[lang]}
          </button>
        ))}
      </div>
      {answer && (
        <>
          <textarea value={comment} maxLength={300} rows={2} onChange={(e) => setComment(e.target.value)} placeholder={T.fbPlaceholder[lang]} />
          <div className="fbrow">
            <button className="go" onClick={send} disabled={state === "sending"}>
              {T.fbSend[lang]}
            </button>
            <small className="muted">{comment.length}/300</small>
          </div>
          {state === "error" && <p className="err">{lang === "zh" ? "沒送出去，請再試一次。" : "Could not send. Try again."}</p>}
        </>
      )}
      <p className="muted small">{T.fbNote[lang]}</p>
    </div>
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
        {zh ? "核對日期" : "Checked"} {new Date(r.createdAt).toLocaleDateString("sv-SE")} ·{" "}
        {r.input.jurisdiction === "TW" ? T.tw[lang] : `${T.ny[lang]}, ${zh ? NY_REGION_LABEL_ZH[r.input.nyRegion ?? "nyc"] : NY_REGION_LABEL[r.input.nyRegion ?? "nyc"]}`} · {zh ? "班表期間" : "Shifts"}{" "}
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
              {r.payslip.paidKind === "net" && c.shortfall !== undefined && c.shortfall > 0 && <small> {zh ? "（比的是實領，可能含扣款）" : " (vs take-home pay; may include deductions)"}</small>}
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
      {(r.alternatives ?? []).map((a, i) => (
        <p className="pnote" key={i}>
          {a.alt[lang]}：{T.expected[lang]} {fmtMoney(a.expectedTotal, cur)}
          {a.shortfall !== undefined ? `，${T.diff[lang]} ${fmtMoney(Math.max(0, a.shortfall), cur)}` : ""}
        </p>
      ))}
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
            {T.holidayTitle[lang]} {holidayName(h.name, lang)} {holidayLabel(h, r.shifts)}：「{shorten(h.citations[0]?.quote ?? "", 40)}」 {h.citations[0]?.url}
          </li>
        ))}
      </ul>
      <p className="pnote">
        {zh ? DISCLAIMER_ZH : r.disclaimer} {zh ? "所有數字由程式依上列官方條文計算。" : "All amounts computed by code from the official text above."}
      </p>
    </div>
  );
}

export default function FairShift({ initialMode, initialNote, initialNoteZh }: { initialMode: "live" | "mock"; initialNote: string; initialNoteZh: string }) {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("TW");
  // English first (judges and most visitors); a Chinese browser or an earlier choice switches it on load.
  const [lang, setLangState] = useState<Lang>("en");
  const [region, setRegion] = useState<NyRegion>("nyc");
  const [job, setJob] = useState<NyJob>("general");
  const [tipsInGross, setTipsInGross] = useState<"unsure" | "no" | "yes">("unsure");
  const hero = SAMPLE_CASES.find((x) => x.id === HERO_SAMPLE)!;
  const [schedule, setSchedule] = useState("");
  const [payslip, setPayslip] = useState("");
  const [rate, setRate] = useState("");
  const [restDay, setRestDay] = useState<string>("");
  const [dayOff, setDayOff] = useState<string>("");
  const [askDays, setAskDays] = useState(false);
  /** The sample whose values fill the form, until the person edits them. */
  const [sample, setSample] = useState<EvalCase | null>(null);
  const [daysFromSample, setDaysFromSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [traceOpen, setTraceOpen] = useState(true);
  const [report, setReport] = useState<FairShiftReport | null>(null);
  const [reportTitle, setReportTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState({ mode: initialMode, note: initialNote, noteZh: initialNoteZh });
  const [copied, setCopied] = useState(false);
  const verdictRef = useRef<HTMLElement>(null);
  const daysRef = useRef<HTMLDivElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("fair-shift-lang");
    } catch {
      /* storage blocked */
    }
    if (saved === "zh" || saved === "en") setLangState(saved);
    else if (typeof navigator !== "undefined" && (navigator.languages?.[0] ?? navigator.language ?? "").toLowerCase().startsWith("zh")) setLangState("zh");
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    try {
      localStorage.setItem("fair-shift-lang", l);
    } catch {
      /* storage blocked */
    }
  }

  // Show the result where the person can see it (on a phone the form is above the fold).
  const reportKey = report ? `${report.id}${report.needsInput ? "n" : ""}${report.parseError ? "e" : ""}` : "";
  useEffect(() => {
    if (reportKey) verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [reportKey]);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 500);
    return () => clearInterval(id);
  }, [busy]);

  const samples = useMemo(() => SAMPLE_CASES.filter((c) => c.input.jurisdiction === jurisdiction), [jurisdiction]);
  const sampleActive = !!sample && sample.input.scheduleText === schedule && sample.input.payslipText === payslip;

  const dayValue = (v: number | null | undefined) => (typeof v === "number" ? String(v) : "none");

  function fill(c: EvalCase) {
    setJurisdiction(c.input.jurisdiction);
    if (c.input.nyRegion) setRegion(c.input.nyRegion);
    setJob(c.input.nyJob ?? "general");
    setTipsInGross(c.input.nyTipsInGross ?? "unsure");
    setSchedule(c.input.scheduleText);
    setPayslip(c.input.payslipText);
    setRate(c.input.hourlyRate ? String(c.input.hourlyRate) : "");
    setRestDay(dayValue(c.input.restDayWeekday));
    setDayOff(dayValue(c.input.dayOffWeekday));
    setSample(c);
    setDaysFromSample(true);
    setAskDays(false);
    setReport(null);
    setSteps([]);
  }

  const sampleTitle = (c: EvalCase) => (lang === "zh" ? (c.titleZh ?? c.title) : c.title);

  async function trySample() {
    fill(hero);
    await run({ ...hero.input, sampleId: hero.id }, null, hero);
  }

  function currentInput(): CheckInput & { sampleId?: string } {
    const day = (v: string) => (v === "none" ? null : v === "" ? undefined : Number(v));
    const r = Number(rate);
    return {
      jurisdiction,
      nyRegion: jurisdiction === "US-NY" ? region : undefined,
      nyJob: jurisdiction === "US-NY" ? job : undefined,
      nyTipsInGross: jurisdiction === "US-NY" && (job === "food_service" || job === "service") ? tipsInGross : undefined,
      scheduleText: schedule,
      payslipText: payslip,
      hourlyRate: rate.trim() && Number.isFinite(r) && r > 0 ? r : undefined,
      restDayWeekday: jurisdiction === "TW" ? day(restDay) : undefined,
      dayOffWeekday: jurisdiction === "TW" ? day(dayOff) : undefined,
      sampleId: sampleActive ? sample!.id : undefined,
    };
  }

  function checkOwn() {
    if (jurisdiction === "TW" && (restDay === "" || dayOff === "")) {
      setAskDays(true);
      requestAnimationFrame(() => daysRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
      return;
    }
    setAskDays(false);
    void run(currentInput(), null, sampleActive ? sample : null);
  }

  async function run(input: CheckInput & { sampleId?: string }, title: string | null, from: EvalCase | null) {
    setBusy(true);
    setElapsed(0);
    setError(null);
    setReport(null);
    setReportTitle(title ?? (from ? `${lang === "zh" ? "範例" : "Sample"}: ${sampleTitle(from)}` : null));
    setSteps([]);
    setTraceOpen(true);
    let got = false;
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
          if (ev.type === "mode") setMode({ mode: ev.mode, note: ev.note, noteZh: ev.noteZh ?? ev.note });
          if (ev.type === "step") setSteps((s) => [...s, ev.step]);
          if (ev.type === "report") {
            got = true;
            setReport(ev.report);
          }
          if (ev.type === "error") setError(ev.message);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      // A sample whose live run was cut off still shows its saved live result.
      if (!got && input.sampleId) {
        const saved = await fetch(`/api/sample?id=${encodeURIComponent(input.sampleId)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (saved?.report) {
          setReport(saved.report);
          setError(null);
        }
      }
      setBusy(false);
    }
  }

  const c = report?.computation;
  const cur = c?.currency ?? (jurisdiction === "TW" ? "TWD" : "USD");
  const gap = c?.shortfall ?? 0;
  const demo = mode.mode === "mock";
  const zhUI = lang === "zh";
  const showResult = report && c && !report.parseError && !report.needsInput;
  const head = showResult ? headlineOf(c, report.payslip) : null;
  const breakDependent = !!report?.premises.some((p) => p.id === "break_unstated");
  const checks = showResult ? c.problems.filter((p) => p.kind === "check") : [];
  const nShifts = report ? shiftCount(report.shifts) : 0;
  const rs = showResult ? reasons(c, report.shifts, report.rules) : [];
  const split = showResult ? splitRules(report) : null;
  const hols = showResult ? usedHolidays(report) : [];
  const rb = report?.recordedBy;
  const recordedText =
    rb &&
    showResult &&
    (zhUI
      ? `代理自己記錄 ${rb.agentRules} 條規定、${rb.agentHolidays} 個假日；程式補上 ${rb.fallbackRules + rb.fallbackHolidays} 項`
      : `the agent recorded ${rb.agentRules} rule(s) and ${rb.agentHolidays} holiday(s); code filled ${rb.fallbackRules + rb.fallbackHolidays}`);
  const tipped = jurisdiction === "US-NY" && (job === "food_service" || job === "service");
  const searchNotes = report?.searchNotes ?? [];
  const dayTypeLabel = (t: string) => (zhUI ? (DAYTYPE_ZH as Record<string, string>)[t] ?? t : t.replace(/_/g, " "));

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
            <span className={`badge ${mode.mode}`} title={zhUI ? mode.noteZh : mode.note}>
              {mode.mode === "live" ? T.live[lang] : T.demo[lang]}
            </span>
          </div>
        </header>
        {demo && (
          <p className="banner">
            <Info size={15} aria-hidden /> {zhUI ? mode.noteZh : mode.note}
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

        {report?.needsInput && (
          <section className="verdict warnbox" ref={verdictRef} aria-live="polite">
            <h2 className="vhead small-head">
              <AlertTriangle size={24} aria-hidden /> {T.needRate[lang]}
            </h2>
            <p>{report.needsInput[lang]}</p>
            <div className="inlinerate">
              <label className="field">
                {T.rate[lang]}
                <input
                  inputMode="decimal"
                  autoFocus
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder={
                    report.payslip.grossPaid && report.payslip.hoursPaid
                      ? `${T.rateSuggest[lang]} ${Math.round((report.payslip.grossPaid / report.payslip.hoursPaid) * 100) / 100}`
                      : jurisdiction === "TW"
                        ? "196"
                        : "17.00"
                  }
                />
              </label>
              <button className="go" onClick={checkOwn} disabled={busy || !(Number(rate) > 0)}>
                {T.checkAgain[lang]}
              </button>
            </div>
          </section>
        )}

        {showResult && (
          <section className={`verdict ${head?.kind === "owed" ? "bad" : head?.kind === "maybe_deductions" ? "warnbox" : "good"}`} ref={verdictRef} aria-live="polite">
            {report.precomputed && (
              <p className="precomp">
                <History size={15} aria-hidden /> <b>{T.savedResult[lang]}.</b> {report.precomputed[lang]}
              </p>
            )}
            <p className="kicker">
              {reportTitle ?? T.yourCheck[lang]}
              {demo && <span className="tag">{T.demo[lang]}</span>}
              {report.parse.confidence === "low" && <span className="tag">{T.lowConf[lang]}</span>}
              {breakDependent && gap > 0 && <span className="tag">{T.breakTag[lang]}</span>}
            </p>
            <h2 className="vhead">
              {c.shortfall === undefined ? (
                <>
                  {T.expectedOnly[lang]} {fmtMoney(c.expectedTotal, cur)}
                </>
              ) : head?.kind === "maybe_deductions" ? (
                <span className="owed small-owed">
                  <small>{T.netSmall[lang]}</small> {fmtMoney(gap, cur)}{" "}
                  <small>
                    ({(head.share * 100).toFixed(1)}%)
                  </small>
                </span>
              ) : gap > 0 ? (
                <span className="owed">
                  <small>{head?.kind === "owed" && head.upTo ? T.upTo[lang] : T.mayBeOwed[lang]}</small> {fmtMoney(gap, cur)}
                </span>
              ) : (
                <>
                  <CheckCircle2 size={28} aria-hidden /> <span className="nogap">{T.noGap[lang]}</span>
                </>
              )}
            </h2>
            {c.shortfall === undefined && (
              <p className="nopaid">
                <AlertTriangle size={15} aria-hidden /> {T.noPaid[lang]}
              </p>
            )}

            <p className="vsub">
              {zhUI
                ? `應領 ${fmtMoney(c.expectedTotal, cur)}${c.paidTotal !== undefined ? `，${report.payslip.paidKind === "net" ? "實領" : "薪資單"} ${fmtMoney(c.paidTotal, cur)}` : ""}。共 ${nShifts} 個班、${c.workedHours} 小時。`
                : `Expected ${fmtMoney(c.expectedTotal, cur)}${c.paidTotal !== undefined ? `, ${report.payslip.paidKind === "net" ? "take-home pay" : "paid"} ${fmtMoney(c.paidTotal, cur)}` : ""}. ${c.workedHours} hours across ${nShifts} shift(s).`}
            </p>
            {gap > 0 && <GapBar r={report} lang={lang} />}
            {(report.alternatives ?? []).map((a, i) => (
              <Compare key={i} a={a} main={c} lang={lang} cur={cur} />
            ))}
            {report.premises.length > 0 && (
              <div className="premise">
                <b>
                  <Info size={14} aria-hidden /> {T.premises[lang]}
                </b>
                <ul>
                  {report.premises.map((p, i) => (
                    <li key={i} className={p.id ? "pwarn" : undefined}>
                      {p.id && <AlertTriangle size={13} aria-hidden />} {p[lang]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {checks.length > 0 && (
              <div className="premise checks">
                <b>
                  <AlertTriangle size={14} aria-hidden /> {T.alsoCheck[lang]}
                </b>
                <ul>
                  {checks.map((p, i) => (
                    <li key={i}>{lang === "zh" ? (p.messageZh ?? p.message) : p.message}</li>
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
                      title={`${T.holidayTitle[lang]}: ${holidayName(h.name, lang)}`}
                      value={holidayLabel(h, report.shifts)}
                      sub={zhUI ? "這天上班，工資加倍（勞動基準法第 39 條）" : "Working this day is paid double (LSA Art. 39)"}
                      cit={h.citations[0]}
                      lang={lang}
                    />
                  ))}
                  {split.used
                    .filter((r) => c.lines.some((l) => lineRuleKeys(l).includes(r.key)) || (r.key.endsWith("min_wage_hourly") && (c.components.minWageTopUp > 0 || r.status !== "in_force")))
                    .slice(0, 4)
                    .map((r, i) => (
                      <MiniRule
                        key={i}
                        title={ruleTitle(r.key, lang)}
                        sub={citeOf(r.key, lang)}
                        value={ruleValueWords(r, cur, lang)}
                        cit={r.status === "cabinet_announced" ? r.citations.at(-2) : r.citations[0]}
                        status={r.status !== "in_force" ? statusWords(r, lang) : undefined}
                        lang={lang}
                      />
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
            {!report.precomputed && <Feedback lang={lang} reportId={report.id} />}
          </section>
        )}

        <section className="grid">
          <div className="card input">
            <h2>{T.checkOwn[lang]}</h2>
            <div className="seg" role="tablist" aria-label={zhUI ? "工作地點" : "Where you work"}>
              {(["TW", "US-NY"] as Jurisdiction[]).map((j) => (
                <button key={j} role="tab" aria-selected={jurisdiction === j} className={jurisdiction === j ? "on" : ""} onClick={() => setJurisdiction(j)}>
                  {j === "TW" ? T.tw[lang] : T.ny[lang]}
                </button>
              ))}
            </div>
            {sampleActive && (
              <p className="samplebox">
                <Info size={14} aria-hidden /> {T.sampleBox[lang]}
              </p>
            )}
            {jurisdiction === "US-NY" ? (
              <>
                <div className="row2">
                  <label className="field">
                    {T.region[lang]}
                    <select value={region} onChange={(e) => setRegion(e.target.value as NyRegion)}>
                      {(Object.keys(NY_REGION_LABEL) as NyRegion[]).map((r) => (
                        <option key={r} value={r}>
                          {zhUI ? NY_REGION_LABEL_ZH[r] : NY_REGION_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    {T.job[lang]}
                    <select value={job} onChange={(e) => setJob(e.target.value as NyJob)}>
                      {(Object.keys(NY_JOB_LABEL) as NyJob[]).map((k) => (
                        <option key={k} value={k}>
                          {zhUI ? NY_JOB_LABEL_ZH[k] : NY_JOB_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {tipped && (
                  <label className="field">
                    {T.tipsQ[lang]}
                    <select value={tipsInGross} onChange={(e) => setTipsInGross(e.target.value as "unsure" | "no" | "yes")}>
                      <option value="unsure">{T.tipsUnsure[lang]}</option>
                      <option value="no">{T.tipsNo[lang]}</option>
                      <option value="yes">{T.tipsYes[lang]}</option>
                    </select>
                  </label>
                )}
              </>
            ) : (
              <div ref={daysRef}>
                <div className={`row2 ${askDays ? "asking" : ""}`}>
                  <label className="field">
                    <span>
                      {T.restDay[lang]} {daysFromSample && sampleActive && <span className="sampletag">{T.sampleTag[lang]}</span>}
                    </span>
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
                    <span>
                      {T.dayOff[lang]} {daysFromSample && sampleActive && <span className="sampletag">{T.sampleTag[lang]}</span>}
                    </span>
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
                <p className="help">{T.dayHelp[lang]}</p>
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
                  const s = SAMPLE_CASES.find((x) => x.id === e.target.value);
                  if (s) fill(s);
                }}
              >
                <option value="">{T.pickSample[lang]}</option>
                {samples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {sampleTitle(s)}
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
                placeholder={jurisdiction === "TW" ? "10/5(一) 17:00-22:00\n或：店長：10/5~10/11這週班表\n週五 18-22 休1小時" : "Mon Oct 5 9am-6pm (30 min break)"}
              />
              <small className="help">{T.schedHelp[lang]}</small>
            </label>
            <label className="field">
              {T.payslip[lang]}
              <textarea
                value={payslip}
                onChange={(e) => setPayslip(e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder={jurisdiction === "TW" ? "薪資單 2026/10/01 - 2026/10/15\n時薪 196\n應發 4,312（或 實領 4,312）" : "Hourly rate: $17.00\nGross pay: $722.50"}
              />
              <small className="help">{T.slipHelp[lang]}</small>
            </label>
            <label className="field ratefield">
              <span>
                {T.rate[lang]} <small className="muted">{T.rateHelp[lang]}</small>
              </span>
              <input ref={rateRef} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} placeholder={jurisdiction === "TW" ? "196" : "17.00"} />
            </label>
            <p className="privshort">
              <Lock size={14} aria-hidden /> {T.privacyShort[lang]}
            </p>
            <button className="go" onClick={checkOwn} disabled={busy}>
              {busy ? <Loader2 className="spin" size={18} aria-hidden /> : <ShieldCheck size={18} aria-hidden />}
              {busy ? `${T.checking[lang]} ${Math.round(elapsed)} s` : T.check[lang]}
            </button>
            {busy && (
              <p className="busyline" aria-live="polite">
                <CircleDot size={14} aria-hidden /> {T.usually[lang]}. {T.seeSteps[lang]}
              </p>
            )}
            {error && (
              <p className="err" role="alert">
                <AlertTriangle size={16} aria-hidden /> {error}
              </p>
            )}
            <p className="privacy">{T.privacy[lang]}</p>
          </div>

          <details className="card trace" open={traceOpen} onToggle={(e) => setTraceOpen((e.target as HTMLDetailsElement).open)} aria-live="polite">
            <summary>
              <h2>
                {steps.length || busy ? T.agent[lang] : T.how[lang]}
                {steps.length > 0 && <span className="count"> ({steps.length})</span>} {demo && <span className="tag">{T.demo[lang]}</span>}
              </h2>
              {recordedText && <span className="muted small">{recordedText}</span>}
            </summary>
            <Stages steps={steps} busy={busy} lang={lang} elapsed={elapsed} />
            {(busy || steps.length > 0) && <p className="muted small">{T.usually[lang]}.</p>}
            {demo && steps.length > 0 && <p className="muted small">{T.demoTrace[lang]}</p>}
            <ol>
              {steps.map((s, i) => (
                <li key={i} className={`step ${s.kind} ${/rejected|_error|step_limit|no_tool|time_stop/.test(s.name) ? "rej" : ""}`}>
                  <StepIcon kind={s.kind} />
                  <span className="sname">{zhUI ? (STEP_ZH[s.name] ?? s.name) : s.name}</span>
                  <span className="sdetail">{zhUI ? (s.detailZh ?? s.detail) : s.detail}</span>
                  {s.model && <span className="smodel">{s.model}</span>}
                </li>
              ))}
            </ol>
          </details>
        </section>

        {showResult && split && (
          <section className="results" id="details">
            <div className="card">
              <h2>{T.lines[lang]}</h2>
              <p className="muted">
                {zhUI
                  ? `共 ${nShifts} 個班、${c.workedHours} 小時。班表由${report.parse.source === "model" ? ` ${report.parse.model} 讀取，並和規則解析交叉比對` : "規則解析器讀取"}。`
                  : `${nShifts} shift(s), ${c.workedHours} hours. Read by ${report.parse.source === "model" ? report.parse.model : "the rule-based parser"}. ${report.parse.crossCheck}`}
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
                            {sh && sh.dayType !== "workday" && <small>{sh.holidayName && sh.dayType === "holiday" ? holidayName(sh.holidayName, lang) : dayTypeLabel(sh.dayType)}</small>}
                            {sh?.continuesFrom && <small>{T.continued[lang]}</small>}
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
                {(report.explanation.messageLang ?? (report.input.jurisdiction === "TW" ? "zh" : "en")) !== lang && (
                  <p className="muted small">{report.input.jurisdiction === "TW" ? T.msgZhNote[lang] : T.msgEnNote[lang]}</p>
                )}
                <pre className="msg" lang={report.input.jurisdiction === "TW" ? "zh-Hant" : "en"}>
                  {report.explanation.messageToEmployer}
                </pre>
                {report.explanation.messageTranslation && (report.explanation.messageLang ?? "zh") !== lang && (
                  <details className="translation">
                    <summary>{T.translation[lang]}</summary>
                    <pre className="msg">{report.explanation.messageTranslation}</pre>
                  </details>
                )}
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

            <details className="card" open>
              <summary>
                <h2>{T.rulesUsed[lang]}</h2>
                <span className="muted small">{recordedText}</span>
              </summary>
              <p className="muted">{T.rulesNote[lang]}</p>
              {searchNotes.map((n, i) => (
                <div className="searchnote" key={i}>
                  <h3>
                    <Search size={14} aria-hidden /> {T.freshness[lang]}
                  </h3>
                  <p>
                    <b>{n.outcome[lang]}</b>
                  </p>
                  <p className="muted small">
                    {T.searched[lang]}「{n.query}」{T.onSites[lang]} {n.domains.join(", ")}:
                  </p>
                  <ul>
                    {n.results.slice(0, 3).map((h, k) => (
                      <li key={k}>
                        <a href={h.url} target="_blank" rel="noreferrer">
                          {shorten(h.title, 80)} <ExternalLink size={11} aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <div className="rules">
                {split.used.map((r, i) => (
                  <RuleCard key={i} r={r} lang={lang} cur={cur} />
                ))}
                {hols.map((h, i) => (
                  <article key={`h${i}`} className="rule">
                    <header>
                      <h3>
                        {T.holidayTitle[lang]}: {holidayName(h.name, lang)}
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
                      <RuleCard key={i} r={o.rule} lang={lang} cur={cur} note={o.why[lang]} />
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
              {report.precomputed ? (
                <>{zhUI ? "存檔結果：這次沒有呼叫任何付費模型或搜尋。" : "Saved result: no paid model or search calls were made for this view."} </>
              ) : demo ? (
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
      {showResult && <PrintReport r={report} lang={lang} />}
    </>
  );
}
