import { specByKey } from "./catalog";
import { minWageFor, tipCreditFor } from "./compute";
import type { FairShiftReport, Jurisdiction, PayLine, RuleKey, RuleRecord } from "./types";

// Words for the result page and the printable report. Taiwan results default to
// Traditional Chinese, New York to English; the page has a language switch.

export type Lang = "zh" | "en";

const MULT: { v: number; zh: string; en: string }[] = [
  { v: 1, zh: "原時薪", en: "straight time" },
  { v: 4 / 3, zh: "加給三分之一", en: "plus one third" },
  { v: 5 / 3, zh: "加給三分之二", en: "plus two thirds" },
  { v: 1.5, zh: "1.5 倍", en: "time and a half" },
  { v: 2, zh: "加倍", en: "double" },
];

/** A multiplier as words: 4/3 -> 加給三分之一 / plus one third. */
export function multiplierWords(v: number, lang: Lang): string {
  const m = MULT.find((x) => Math.abs(x.v - v) < 1e-6);
  if (m) return m[lang];
  return lang === "zh" ? `${v.toFixed(2)} 倍` : `${v.toFixed(2)} times`;
}

export function lineLabel(l: PayLine, lang: Lang): string {
  return lang === "zh" && l.labelZh ? l.labelZh : l.label;
}

export function lineNote(l: PayLine, lang: Lang): string | undefined {
  return lang === "zh" && l.noteZh ? l.noteZh : l.note;
}

/** Article reference for a rule key, e.g. 勞動基準法第 39 條. */
export function citeOf(k: RuleKey, lang: Lang): string {
  const s = specByKey(k);
  return s ? s.cite[lang] : k;
}

export function ruleTitle(k: RuleKey, lang: Lang): string {
  const s = specByKey(k);
  return s ? (lang === "zh" ? s.labelZh : s.label) : k;
}

/** The rules that a line's extra pay comes from (not the minimum wage, unless it raised the rate). */
export function lineRuleKeys(l: PayLine): RuleKey[] {
  const prem = l.ruleKeys.filter((k) => !k.endsWith("min_wage_hourly") && k !== "ny.tip_credit");
  return prem.length ? prem : l.ruleKeys.filter((k) => k === "ny.tip_credit");
}

/**
 * Rules that changed this result, and the other rules retrieved (shown folded).
 * A dated rate counts as used only if it was the one in force on a shift date.
 */
export function splitRules(r: FairShiftReport): { used: RuleRecord[]; other: { rule: RuleRecord; why: Record<Lang, string> }[] } {
  const keys = new Set(r.computation.lines.flatMap((l) => l.ruleKeys));
  const dates = r.shifts.map((s) => s.date);
  const dated = new Set<RuleRecord>();
  for (const d of dates) {
    const mw = minWageFor(r.rules, d, r.input.jurisdiction === "US-NY" ? r.input.nyRegion : undefined);
    if (mw) dated.add(mw);
    if (r.input.nyRegion && (r.input.nyJob === "food_service" || r.input.nyJob === "service")) {
      const tc = tipCreditFor(r.rules, d, r.input.nyRegion, r.input.nyJob);
      if (tc) dated.add(tc);
    }
  }
  const used: RuleRecord[] = [];
  const other: { rule: RuleRecord; why: Record<Lang, string> }[] = [];
  for (const rule of r.rules) {
    const isDated = !!rule.effectiveFrom;
    if (isDated ? dated.has(rule) && keys.has(rule.key) : keys.has(rule.key)) {
      used.push(rule);
      continue;
    }
    if (isDated) {
      const newer = r.rules.find((x) => x !== rule && x.key === rule.key && x.region === rule.region && x.variant === rule.variant && dated.has(x) && x.effectiveFrom! > rule.effectiveFrom!);
      if (newer)
        other.push({
          rule,
          why: {
            zh: `已不適用：${newer.effectiveFrom} 起改為 ${newer.value}。`,
            en: `No longer in force: replaced by ${newer.value} from ${newer.effectiveFrom}.`,
          },
        });
      else other.push({ rule, why: { zh: "不在這次班表的日期內。", en: "Does not cover these shift dates." } });
    } else other.push({ rule, why: { zh: "這次的班沒有用到。", en: "Not needed for these shifts." } });
  }
  return { used, other };
}

export interface Step {
  zh: string;
  en: string;
  link?: { href: string; zh: string; en: string };
  tel?: string;
}

/** What to do next. Facts checked on the official pages linked here on 2026-10-14. */
export function nextSteps(j: Jurisdiction): Step[] {
  if (j === "TW")
    return [
      {
        zh: "先把證據留好：班表截圖、打卡紀錄、薪資單。你可以向雇主要自己的出勤紀錄影本，雇主不能拒絕（勞動基準法第 30 條第 6 項）。",
        en: "Keep the evidence: schedule screenshots, clock-in records and payslips. You can ask your employer for a copy of your attendance record, and they may not refuse (Labor Standards Act Art. 30, para. 6).",
        link: { href: "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=30", zh: "勞動基準法第 30 條", en: "LSA Art. 30" },
      },
      {
        zh: "打 1955 勞工諮詢申訴專線問問看，免付費、24 小時都有人接。",
        en: "Call the 1955 labor hotline (free, 24 hours) to ask about your case.",
        tel: "1955",
        link: { href: "https://mol.gov.tw/service/32300/32320", zh: "1955 專線介紹", en: "About the 1955 hotline" },
      },
      {
        zh: "可以向工作地點的縣市勞工局申訴，或申請勞資爭議調解。",
        en: "You can file a complaint with the labor bureau of the city or county where you work, or apply for labor dispute mediation there.",
        link: { href: "https://www.mol.gov.tw/1607/28690/89680/nodelist", zh: "勞動部：發生勞資爭議怎麼辦？", en: "Ministry of Labor: what to do in a labor dispute" },
      },
      {
        zh: "雇主不能因為你申訴就解僱、降調、減薪或給你其他不利的對待（勞動基準法第 74 條）。",
        en: "Your employer may not fire you, demote you, cut your pay or treat you worse because you complained (Labor Standards Act Art. 74).",
        link: { href: "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=74", zh: "勞動基準法第 74 條", en: "LSA Art. 74" },
      },
      {
        zh: "時間有限：勞動部的函釋把工資請求權套用民法第 126 條的 5 年時效，每一期工資從該付的那天起算。越早處理越好舉證。",
        en: "Time limits apply: the Ministry of Labor applies the 5-year limit of Civil Code Art. 126 to each wage payment, counted from the day it was due. The sooner you act, the easier it is to prove.",
        link: { href: "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=126", zh: "民法第 126 條", en: "Civil Code Art. 126" },
      },
    ];
  return [
    {
      en: "Keep your schedule, pay stubs and any time records. Do not send originals when you file.",
      zh: "留好班表、薪資單和打卡紀錄。申訴時不要寄正本。",
    },
    {
      en: "File a Labor Standards complaint (form LS223) with the New York State Department of Labor. It covers wages earned in the last three years.",
      zh: "向紐約州勞工局提出勞動標準申訴（LS223 表），可追討最近三年內的工資。",
      link: { href: "https://dol.ny.gov/unpaidwithheld-wages-and-wage-supplements", en: "NYS DOL: unpaid wages", zh: "紐約州勞工局：未付工資" },
    },
    {
      en: "Call NYS DOL for help filing the complaint.",
      zh: "填申訴表有問題可以打電話問紐約州勞工局。",
      tel: "888-525-2267",
    },
    {
      en: "An employer that takes action against you for a Labor Law complaint can be reported on the same page.",
      zh: "如果雇主因為你申訴而對你不利，也可以在同一頁檢舉。",
    },
  ];
}

/** Things the tool does not check, shown on the result page. */
export function notChecked(j: Jurisdiction): { zh: string; en: string }[] {
  if (j === "TW")
    return [
      { zh: "變形工時：如果你的公司合法採用變形工時，加班的算法會不同。", en: "Flexible working hours (變形工時): if your employer legally uses them, overtime is counted differently." },
      {
        zh: "國定假日原本排了班、雇主叫你那天不用來：當天工資仍要照給，這個工具沒有檢查。",
        en: "A holiday you were scheduled for but told not to come in: that day's pay is still owed. Not checked.",
      },
      { zh: "每月加班時數的上限。", en: "The monthly cap on overtime hours." },
      { zh: "國定假日遇到休息日或例假時，補假是哪一天。", en: "Which day is the substitute day off when a holiday falls on your rest day or day off." },
      { zh: "月薪制、責任制、原住民族歲時祭儀放假。", en: "Monthly-paid jobs, exempt jobs under Art. 84-1, and indigenous ritual holidays." },
    ];
  return [
    { en: "Call-in pay.", zh: "臨時被叫來上班的報到工資。" },
    { en: "Split-shift pay outside the spread-of-hours rule.", zh: "工時跨度規定以外的拆班工資。" },
    { en: "Uniform maintenance and meal allowances.", zh: "制服維護費與餐費。" },
    { en: "The tip threshold for service employees.", zh: "服務員工的小費門檻。" },
    { en: "Fast food and home care minimum wage rates.", zh: "速食業與居家照護的另一套最低工資。" },
  ];
}

export const DISCLAIMER_ZH =
  "Fair Shift 是核對工具，不是法律意見。它只用這次取得的官方規定和你輸入的工時計算。採取行動前，請先向勞工主管機關確認（台灣：1955 專線或縣市勞工局；紐約：紐約州勞工局）。";
