import { specByKey } from "./catalog";
import { shiftCount } from "./compute";
import type { Alternative, Computation, PayLine, RuleKey, RuleRecord, Shift } from "./types";

// Plain-language reasons, the explanation and the message to the employer.
// The model may write the explanation in live mode, but every number it uses
// must already exist in the computation; if not, the code template is used.
// The employer message is always this template, so it always cites the
// article numbers.

const money = (n: number, c: "TWD" | "USD") => (c === "TWD" ? `NT$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const hrs = (n: number) => String(Math.round(n * 100) / 100);

export function hasCJK(s: string): boolean {
  return /[㐀-鿿]/.test(s);
}

// Common characters that only exist in simplified Chinese. Not complete, but a
// model that slips into simplified Chinese uses several of these at once.
const SIMPLIFIED = /[们这为说时实发际资应该过对国庆钟边计费让总单号开关业务员证书讯议论记读写问题获从个车东么见长门马鸟鱼龙给额补双劳动节当规则历条]/;

/** True if the text has characters used only in simplified Chinese. */
export function hasSimplified(s: string): boolean {
  return SIMPLIFIED.test(s);
}

/** English names of Taiwan's national holidays, for the English page. */
const HOLIDAY_EN: [RegExp, string][] = [
  [/開國紀念日/, "Republic Day"],
  [/和平紀念日/, "Peace Memorial Day"],
  [/兒童節/, "Children's Day"],
  [/勞動節/, "Labor Day"],
  [/國慶日/, "National Day"],
  [/孔子誕辰/, "Confucius' Birthday"],
  [/光復/, "Retrocession Day"],
  [/行憲/, "Constitution Day"],
  [/除夕/, "Lunar New Year's Eve"],
  [/春節/, "Lunar New Year"],
  [/清明|掃墓/, "Tomb Sweeping Day"],
  [/端午/, "Dragon Boat Festival"],
  [/中秋/, "Mid-Autumn Festival"],
  [/原住民族/, "Indigenous Peoples' Day"],
];

/** "國慶日" -> "National Day (國慶日)". Unknown names stay as they are. */
export function holidayNameEn(name: string): string {
  const m = HOLIDAY_EN.find(([re]) => re.test(name));
  return m ? `${m[1]} (${name})` : name;
}

/** 2026-10-10 -> "10/10" (zh) or "Oct 10" (en). */
export function shortDate(d: string, zh: boolean): string {
  const m = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  return zh ? `${m}/${day}` : `${MONTHS[m - 1]} ${day}`;
}

function dateList(dates: string[], zh: boolean): string {
  const u = [...new Set(dates)].sort().map((d) => shortDate(d, zh));
  return zh ? u.join("、") : u.join(", ");
}

export interface Reason {
  kind: "holiday" | "day_off" | "rest_day" | "weekly_ot" | "daily_ot" | "ny_tipped_ot" | "ny_ot" | "spread" | "min_wage" | "tip_makeup" | "unpaid_hours";
  en: string;
  zh: string;
  /** Where the rule is written. */
  cite: { en: string; zh: string };
  amount?: number;
  hours?: number;
  dates: string[];
  /** Overtime on a shift with no break written: a break would make it smaller or remove it. */
  dependsOnBreak?: boolean;
}

interface Group {
  kind: Reason["kind"];
  keys: RuleKey[];
}

// A pay line belongs to the first group that lists one of its rules.
const GROUPS: Group[] = [
  { kind: "holiday", keys: ["tw.holiday"] },
  { kind: "day_off", keys: ["tw.day_off"] },
  { kind: "rest_day", keys: ["tw.rest_first2", "tw.rest_after2"] },
  { kind: "weekly_ot", keys: ["tw.weekly_hours"] },
  { kind: "daily_ot", keys: ["tw.ot_first2", "tw.ot_next2"] },
  { kind: "ny_tipped_ot", keys: ["ny.ot_tipped"] },
  { kind: "ny_ot", keys: ["ny.ot_weekly"] },
  { kind: "spread", keys: ["ny.spread_hosp", "ny.spread_misc"] },
];

/** The part of a line above straight time, i.e. what the special rule adds. */
export function lineExtra(l: PayLine): number {
  if (l.label.startsWith("Spread") || l.label.startsWith("Tips plus cash wage")) return l.amount;
  return l.amount - l.hours * (l.baseRate - (l.deduction ?? 0));
}

/**
 * Why the expected pay is what it is, as specific facts: which dates, how many
 * hours, which rule and article, how much it adds. Only reasons that occurred
 * in this check are listed.
 */
export function reasons(c: Computation, shifts: Shift[], rules: RuleRecord[]): Reason[] {
  const cur = c.currency;
  const out: Reason[] = [];
  const buckets = new Map<Reason["kind"], { amount: number; hours: number; dates: string[]; keys: Set<RuleKey>; noBreak: boolean }>();
  const byId = new Map(shifts.map((s) => [s.id, s]));
  for (const l of c.lines) {
    if (l.label.startsWith("Tips plus cash wage")) continue;
    const extra = lineExtra(l);
    if (extra <= 0.005) continue;
    const g = GROUPS.find((x) => x.keys.some((k) => l.ruleKeys.includes(k)));
    if (!g) continue;
    const b = buckets.get(g.kind) ?? { amount: 0, hours: 0, dates: [], keys: new Set<RuleKey>(), noBreak: false };
    // Overtime counted on a long shift with no break written depends on the break.
    if (["weekly_ot", "daily_ot", "ny_ot", "ny_tipped_ot"].includes(g.kind) && byId.get(l.shiftId)?.breakUnstated) b.noBreak = true;
    b.amount += extra;
    b.hours += l.label.startsWith("Spread") ? 0 : l.hours;
    b.dates.push(l.date);
    l.ruleKeys.forEach((k) => b.keys.add(k));
    buckets.set(g.kind, b);
  }
  const cite = (...keys: RuleKey[]) => {
    const specs = keys.map((k) => specByKey(k)).filter((x): x is NonNullable<typeof x> => !!x);
    return { en: [...new Set(specs.map((s) => s.cite.en))].join("; "), zh: [...new Set(specs.map((s) => s.cite.zh))].join("、") };
  };
  for (const g of GROUPS) {
    const b = buckets.get(g.kind);
    if (!b) continue;
    const h = hrs(b.hours);
    const dz = dateList(b.dates, true);
    const de = dateList(b.dates, false);
    const amt = money(b.amount, cur);
    const base = { kind: g.kind, amount: Math.round(b.amount * 100) / 100, hours: b.hours, dates: [...new Set(b.dates)], dependsOnBreak: b.noBreak || undefined };
    if (g.kind === "holiday") {
      const names = [...new Set(shifts.filter((s) => s.dayType === "holiday" && b.dates.includes(s.date)).map((s) => s.holidayName).filter(Boolean))];
      out.push({
        ...base,
        zh: `${dz}（${names.join("、") || "國定假日"}）出勤 ${h} 小時：國定假日出勤，工資應加倍發給，這部分加給 ${amt}`,
        en: `${de} (${names.map((n) => holidayNameEn(n!)).join(", ") || "national holiday"}), ${h} hours: work on a national holiday is paid double, which adds ${amt}`,
        cite: cite("tw.holiday"),
      });
    } else if (g.kind === "day_off") {
      out.push({
        ...base,
        zh: `${dz} 例假出勤 ${h} 小時：工資應加倍發給，這部分加給 ${amt}`,
        en: `${de}, regular day off, ${h} hours: paid double, which adds ${amt}`,
        cite: cite("tw.day_off"),
      });
    } else if (g.kind === "rest_day") {
      out.push({
        ...base,
        zh: `${dz} 休息日出勤 ${h} 小時：前 2 小時另加給一又三分之一，之後另加給一又三分之二，這部分加給 ${amt}`,
        en: `${de}, rest day, ${h} hours: the first 2 hours are paid at 1 and 1/3 times, later hours at 1 and 2/3 times, which adds ${amt}`,
        cite: cite("tw.rest_first2"),
      });
    } else if (g.kind === "weekly_ot") {
      out.push({
        ...base,
        zh: `這週總工時超過 40 小時，超過的 ${h} 小時（${dz}）算延長工時：前 2 小時加給三分之一，之後加給三分之二，這部分加給 ${amt}`,
        en: `Hours over 40 in the week: ${h} hours (${de}) are overtime, paid plus 1/3 for the first 2 hours of the day, then plus 2/3, which adds ${amt}`,
        cite: cite("tw.weekly_hours", "tw.ot_first2"),
      });
    } else if (g.kind === "daily_ot") {
      out.push({
        ...base,
        zh: `${dz} 一天超過 8 小時，超過的 ${h} 小時算延長工時：前 2 小時加給三分之一，之後加給三分之二，這部分加給 ${amt}`,
        en: `${de}: ${h} hours past 8 in a day are overtime, paid plus 1/3 for the first 2 hours, then plus 2/3, which adds ${amt}`,
        cite: cite("tw.ot_first2"),
      });
    } else if (g.kind === "ny_tipped_ot") {
      out.push({
        ...base,
        zh: `本週超過 40 小時的 ${h} 小時：小費員工的加班費是「完整最低工資的 1.5 倍再扣小費抵減」，這部分加給 ${amt}`,
        en: `${h} hours over 40 in the week: tipped overtime is 1.5 times the full minimum wage minus the tip credit, not 1.5 times the cash wage, which adds ${amt}`,
        cite: cite("ny.ot_tipped"),
      });
    } else if (g.kind === "ny_ot") {
      out.push({
        ...base,
        zh: `本週超過 40 小時的 ${h} 小時要付 1.5 倍，這部分加給 ${amt}`,
        en: `${h} hours over 40 in the week are paid at time and a half, which adds ${amt}`,
        cite: cite("ny.ot_weekly"),
      });
    } else if (g.kind === "spread") {
      const key = [...b.keys].find((k) => k.startsWith("ny.spread")) ?? "ny.spread_hosp";
      out.push({
        ...base,
        zh: `${dz} 從第一個班開始到最後一個班結束超過 10 小時：要多付 1 小時最低工資，共 ${amt}`,
        en: `${de}: the workday spanned more than 10 hours from first start to last end, so one extra hour at the minimum wage is owed: ${amt}`,
        cite: cite(key),
      });
    }
  }
  for (const r of out)
    if (r.dependsOnBreak) {
      r.zh += "（班表沒寫休息，整段都算上班；如果中間有休息，這筆會變少或沒有）";
      r.en += " (no break was written, so the whole shift counts as work; with a break this is smaller or none)";
    }
  const tipLine = c.lines.find((l) => l.label.startsWith("Tips plus cash wage"));
  if (tipLine)
    out.push({
      kind: "tip_makeup",
      amount: Math.round(tipLine.amount * 100) / 100,
      dates: [],
      zh: `小費加現金工資沒有達到最低工資，雇主要補足差額 ${money(tipLine.amount, cur)}`,
      en: `Tips plus the cash wage came to less than the minimum wage for the hours worked, so the employer must make up ${money(tipLine.amount, cur)}`,
      cite: cite("ny.tip_credit"),
    });
  const below = c.problems.find((p) => p.kind === "below_min_wage" && !tipLine);
  if (below?.amount) {
    const mwLine = c.lines.find((l) => l.ruleKeys.some((k) => k.endsWith("min_wage_hourly")));
    const mwRule = rules.find((r) => r.key.endsWith("min_wage_hourly") && mwLine && r.value === mwLine.baseRate);
    const mw = mwLine ? money(mwLine.baseRate, cur) : "";
    out.push({
      kind: "min_wage",
      amount: below.amount,
      dates: [],
      zh: `薪資單上的時薪低於最低工資 ${mw}${mwRule?.effectiveFrom ? `（${mwRule.effectiveFrom} 起）` : ""}，補到最低工資要多 ${money(below.amount, cur)}`,
      en: `The hourly rate on the payslip is below the minimum wage of ${mw}${mwRule?.effectiveFrom ? ` (from ${mwRule.effectiveFrom})` : ""}; raising it adds ${money(below.amount, cur)}`,
      cite: cite(cur === "TWD" ? "tw.min_wage_hourly" : "ny.min_wage_hourly"),
    });
  }
  const unpaid = c.problems.find((p) => p.kind === "unpaid_hours");
  if (unpaid)
    out.push({
      kind: "unpaid_hours",
      amount: unpaid.amount,
      dates: [],
      zh: unpaid.messageZh ?? unpaid.message,
      en: unpaid.message.replace(/\.$/, ""),
      cite: { en: "your schedule and payslip", zh: "你的班表與薪資單" },
    });
  return out;
}

const BREAK_SUFFIX_ZH = "（班表沒寫休息，整段都算上班；如果中間有休息，這筆會變少或沒有）";
const BREAK_SUFFIX_EN = " (no break was written, so the whole shift counts as work; with a break this is smaller or none)";

/** True if a reason is overtime of some kind (daily, weekly, New York, tipped). */
export function isOvertimeReason(r: Reason): boolean {
  return ["weekly_ot", "daily_ot", "ny_ot", "ny_tipped_ot"].includes(r.kind);
}

/**
 * What the amount in the employer message rests on, in the worker's voice:
 * the reading of a holiday that may be the rest day, a long shift with no
 * break written, gross pay that may include tips, and (Taiwan) a rest day and
 * day off that were not given. The message states these next to the amount,
 * so the employer sees the premises, not just a number.
 */
export function messageAssumptions(
  c: Computation,
  shifts: Shift[],
  opts: { alternatives?: Alternative[]; restDayUnknown?: boolean } = {},
): { zh: string; en: string }[] {
  const out: { zh: string; en: string }[] = [];
  const tw = c.currency === "TWD";
  const named = (ds: string[], zh: boolean) =>
    ds
      .map((d) => {
        const h = shifts.find((s) => s.date === d && s.holidayName)?.holidayName;
        return zh ? `${shortDate(d, true)}${h ? `（${h}）` : ""}` : `${shortDate(d, false)}${h ? ` (${holidayNameEn(h)})` : ""}`;
      })
      .join(zh ? "、" : ", ");
  const alts = opts.alternatives ?? [];
  const hol = alts.find((a) => a.id === "holiday_as_rest_day" || a.id === "holiday_as_holiday");
  if (hol?.dates?.length) {
    const dz0 = named([...new Set(hol.dates)].sort(), true);
    const dz = dz0.endsWith("）") ? dz0 : `${dz0} `;
    const de = named([...new Set(hol.dates)].sort(), false);
    out.push(
      hol.id === "holiday_as_rest_day"
        ? {
            zh: `我把 ${dz}算成國定假日出勤，工資加倍；如果那天其實是我的休息日，就要改照休息日的規定計算，另給一天補假，金額會不同。`,
            en: `I counted ${de} as work on a national holiday, paid double. If that day was my rest day, the rest day rules apply instead, plus a substitute day off, and the amount is different.`,
          }
        : {
            zh: `我把 ${dz}算成我的休息日出勤，另給一天補假；如果那天是當國定假日上班，工資應加倍，金額會不同。`,
            en: `I counted ${de} as work on my rest day, plus a substitute day off. If it was worked as the national holiday, it is paid double and the amount is different.`,
          },
    );
  } else if (tw && opts.restDayUnknown) {
    out.push({
      zh: "我沒有固定的休息日和例假可填，所以每一天都當一般工作日計算；如果其中一天是我的休息日或例假，金額會不同。",
      en: "I did not give a fixed rest day or regular day off, so every day is counted as a normal workday. If one of them was my rest day or day off, the amount is different.",
    });
  }
  const noBreak = [...new Set(shifts.filter((s) => s.breakUnstated && !s.continuesFrom).map((s) => s.date))].sort();
  if (noBreak.length)
    out.push({
      zh: `班表上沒有寫休息時間（${noBreak.map((d) => shortDate(d, true)).join("、")}），我是把上下班之間整段算成工時；如果中間有休息，請以實際休息時間為準，金額會比較少。`,
      en: `My schedule does not list a break for ${noBreak.map((d) => shortDate(d, false)).join(", ")}, so I counted the whole time from start to finish as work. If there was a break, the actual break time applies and the amount is lower.`,
    });
  if (alts.some((a) => a.id === "tips_in_gross"))
    out.push({
      zh: "我把薪資單上的薪資總額當作只有工資、不含小費；如果裡面含小費，實際付的工資比較少，差額會更大。",
      en: "I counted the gross pay on my payslip as wages only. If it includes my tips, the wages actually paid were lower and the difference is larger.",
    });
  return out;
}

export function templateExplanation(
  c: Computation,
  shifts: Shift[],
  rules: RuleRecord[] = [],
  opts: { netOnly?: boolean; alternatives?: Alternative[]; restDayUnknown?: boolean } = {},
): { text: string; textZh: string; messageToEmployer: string; messageTranslation: string; messageLang: "zh" | "en" } {
  const cur = c.currency;
  const exp = money(c.expectedTotal, cur);
  const paid = c.paidTotal !== undefined ? money(c.paidTotal, cur) : null;
  const gap = c.shortfall !== undefined && c.shortfall > 0 ? money(c.shortfall, cur) : null;
  const rs = reasons(c, shifts, rules);
  const tw = cur === "TWD";
  const n = shiftCount(shifts);
  const net = !!opts.netOnly && !!paid;

  const text = [
    `You worked ${c.workedHours} hours in ${n} shift(s). Based on what you entered and the official rules retrieved, the expected pay is ${exp}.`,
    paid
      ? gap
        ? net
          ? `The payslip only shows take-home pay of ${paid}, after deductions such as labor and health insurance, so part or all of the ${gap} gap may be those deductions. Ask for the gross amount and the list of deductions.`
          : `The payslip shows ${paid}, so you may be owed ${gap}.`
        : `The payslip shows ${paid}. No shortfall was found.`
      : "No amount paid was found on the payslip, so there is no difference to show.",
    rs.length ? `Why: ${rs.map((r) => `${r.en} (${r.cite.en})`).join(". ")}.` : "No overtime, holiday or minimum wage rule changed the amount.",
  ].join(" ");
  const textZh = [
    `你這期上了 ${n} 個班，共 ${c.workedHours} 小時。照你貼的資料和這次查到的官方規定，應該領 ${exp}。`,
    paid
      ? gap
        ? net
          ? `薪資單只有實領 ${paid}，這是扣掉勞保、健保之後的錢，所以差的 ${gap} 可能有一部分或全部是扣款。可以跟老闆要應發金額和扣款明細再比一次。`
          : `薪資單上是 ${paid}，你可能少領了 ${gap}。`
        : `薪資單上是 ${paid}，沒有少領。`
      : "薪資單上沒讀到實領或應發金額，所以算不出差多少。",
    rs.length ? `原因：${rs.map((r) => `${r.zh}（${r.cite.zh}）`).join("；")}。` : "這期沒有加班、國定假日或最低工資的問題。",
  ].join("");

  const dates = shifts.map((s) => s.date).sort();
  const spanOf = (sep: string) => (dates.length ? (dates[0] === dates.at(-1) ? dates[0] : `${dates[0]} ${sep} ${dates.at(-1)}`) : "");
  // The premises go right after the amount, so the employer reads the number with what it rests on.
  const premises = messageAssumptions(c, shifts, opts);
  // The break premise is stated once; the per-reason note would repeat it.
  const brk = premises.some((p) => p.zh.includes("沒有寫休息"));
  const rZh = (r: Reason) => (brk ? r.zh.replace(BREAK_SUFFIX_ZH, "") : r.zh);
  const rEn = (r: Reason) => (brk ? r.en.replace(BREAK_SUFFIX_EN, "") : r.en);
  const zhMsg = !gap
    ? "這次核對沒有發現短少，不需要寄信給雇主。"
    : [
        "您好，",
        `我核對了 ${spanOf("至")} 的班表和薪資單：總工時 ${c.workedHours} 小時，依${tw ? "勞動部公告與勞動基準法" : "紐約州勞工局公布的規定"}計算，${premises.length ? "在下面的前提下" : ""}應領 ${exp}${net ? "" : `，薪資單實領 ${paid}，相差 ${gap}`}。`,
        premises.length ? "前提：" : "",
        ...premises.map((p) => `・${p.zh}`),
        net ? "薪資單上只有實領金額，看不出扣了哪些項目，所以我還不確定有沒有少領。想請您提供這期的應發金額和扣款明細（例如勞保、健保自付額），讓我核對。" : "",
        rs.length ? (net ? "我的計算包含：" : "差額主要來自：") : "",
        ...rs.map((r, i) => `${i + 1}. ${rZh(r)}（${r.cite.zh}）。`),
        "我附上一頁式計算報告，裡面有每一天的計算方式和官方條文連結。想請您幫忙確認，如果是我算錯了，也請告訴我。謝謝！",
      ]
        .filter(Boolean)
        .join("\n");
  const enMsg = !gap
    ? "No shortfall was found, so there is nothing to ask your employer about."
    : [
        "Hi,",
        `I checked my schedule against my payslip for ${spanOf("to")}. I worked ${c.workedHours} hours. Using the ${tw ? "Ministry of Labor's published rates and the Labor Standards Act" : "state's published rules"}${premises.length ? ", and the assumptions below" : ""}, I expected ${exp}${net ? "" : ` and received ${paid}, a difference of ${gap}`}.`,
        premises.length ? "This rests on:" : "",
        ...premises.map((p) => `- ${p.en}`),
        net
          ? "The payslip only shows take-home pay, so I cannot tell which deductions were made. Could you send me the gross pay for this period and the list of deductions (for example labor and health insurance) so I can check?"
          : "",
        rs.length ? (net ? "My calculation includes:" : "The difference comes from:") : "",
        ...rs.map((r, i) => `${i + 1}. ${rEn(r)} (${r.cite.en}).`),
        "I have attached a one-page report with the calculation for each day and links to the official rules. Could you take a look? If I have missed something, please let me know.",
        "Thank you.",
      ]
        .filter(Boolean)
        .join("\n");
  // The message is in the employer's language; the other language is a translation for the worker.
  const messageToEmployer = tw ? zhMsg : enMsg;
  const messageTranslation = tw ? enMsg : zhMsg;
  return { text, textZh, messageToEmployer, messageTranslation, messageLang: tw ? "zh" : "en" };
}

/** Every number a model may mention. */
export function allowedNumbers(c: Computation, shifts: Shift[], rules: RuleRecord[]): Set<string> {
  const set = new Set<string>();
  const add = (n: number) => {
    set.add(String(n));
    set.add(String(Math.round(n)));
    set.add(n.toFixed(2));
    set.add(Math.round(n).toLocaleString("en-US"));
    set.add(n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };
  [c.expectedTotal, c.paidTotal ?? 0, c.shortfall ?? 0, c.workedHours, c.components.base, c.components.minWageTopUp, c.components.premiums].forEach(add);
  for (const p of c.problems) if (p.amount !== undefined) add(p.amount);
  for (const l of c.lines) [l.hours, l.baseRate, l.amount, l.deduction ?? 0].forEach(add);
  for (const r of rules) {
    add(r.value);
    // "from 2026-01-01": the dates of the rules used may be mentioned too.
    for (const d of [r.effectiveFrom, r.effectiveTo, r.statusDate]) for (const part of d?.split("-") ?? []) (set.add(part), set.add(String(Number(part))));
  }
  for (const r of reasons(c, shifts, rules)) {
    if (r.amount !== undefined) add(r.amount);
    if (r.hours !== undefined) add(r.hours);
    for (const m of (r.cite.en + " " + r.cite.zh).matchAll(/\d+(?:\.\d+)?/g)) set.add(m[0]);
  }
  for (const s of shifts) {
    for (const part of [...s.date.split("-"), ...s.start.split(":"), ...s.end.split(":")]) {
      set.add(part);
      set.add(String(Number(part)));
    }
    add(s.hours);
  }
  for (const n of [1, 2, 3, 4, 8, 10, 12, 24, 39, 40, 1955, 1.5]) add(n);
  return set;
}

export function numbersOutsideSet(text: string, allowed: Set<string>): string[] {
  const bad: string[] = [];
  for (const m of text.normalize("NFKC").matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/,$/, "");
    if (!allowed.has(raw) && !allowed.has(raw.replace(/,/g, ""))) bad.push(raw);
  }
  return bad;
}
