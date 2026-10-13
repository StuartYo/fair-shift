// Parsers used to check that a rule value really appears in the quoted source.
// Covers Chinese numerals and fractions (三分之一, 一又三分之二, 加倍),
// ROC and Western dates, and English forms (1 ½ times, time and one-half).

const CN_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** Parses Chinese integers up to 9999 (e.g. 十, 十二, 二十八, 一百十六). Returns NaN if not a number. */
export function cnInt(s: string): number {
  if (/^\d+$/.test(s)) return Number(s);
  if (!s) return NaN;
  let total = 0;
  let cur = 0;
  let seen = false;
  for (const ch of s) {
    if (ch in CN_DIGIT) {
      cur = CN_DIGIT[ch];
      seen = true;
    } else if (ch === "十") {
      total += (cur || 1) * 10;
      cur = 0;
      seen = true;
    } else if (ch === "百") {
      total += (cur || 1) * 100;
      cur = 0;
      seen = true;
    } else if (ch === "千") {
      total += (cur || 1) * 1000;
      cur = 0;
      seen = true;
    } else return NaN;
  }
  return seen ? total + cur : NaN;
}

const CN_NUM = "[零〇一二兩三四五六七八九十百千0-9]+";

/** All multipliers / fractions stated in a quote. */
export function statedRates(quote: string): number[] {
  const out: number[] = [];
  const q = quote.normalize("NFKC");
  // 一又三分之一 -> 1 + 1/3 (consume so the inner fraction is not counted again)
  let rest = q.replace(new RegExp(`(${CN_NUM})又(${CN_NUM})分之(${CN_NUM})`, "g"), (_m, w, d, n) => {
    out.push(cnInt(w) + cnInt(n) / cnInt(d));
    return " ";
  });
  rest = rest.replace(new RegExp(`(${CN_NUM})分之(${CN_NUM})`, "g"), (_m, d, n) => {
    out.push(cnInt(n) / cnInt(d));
    return " ";
  });
  if (/加倍/.test(rest)) out.push(2);
  // English: "1 ½ times", "1.5 times", "one and one-half times", "time and one-half"
  if (/1\s*1\/2\s*times|1\s*½\s*times|1½\s*times/i.test(quote) || /\b1\.5\s*times\b/i.test(q)) out.push(1.5);
  if (/one and one[- ]half times|time and one[- ]half|time-and-a-half/i.test(q)) out.push(1.5);
  return out.filter((n) => Number.isFinite(n));
}

/** Money amounts stated in a quote: "$17.00", "17.00", "196元", "29,500元". */
export function statedAmounts(quote: string): number[] {
  const q = quote.normalize("NFKC");
  const out: number[] = [];
  for (const m of q.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g)) out.push(Number(m[1].replace(/,/g, "")));
  for (const m of q.matchAll(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*元/g)) out.push(Number(m[1].replace(/,/g, "")));
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Dates stated in a quote, as YYYY-MM-DD. ROC years (民國 115年 / 115年) map to +1911. */
export function statedDates(quote: string): string[] {
  const q = quote.normalize("NFKC");
  const out = new Set<string>();
  for (const m of q.matchAll(/(\d{2,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g)) {
    let y = Number(m[1]);
    if (y < 1000) y += 1911;
    out.add(`${y}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`);
  }
  for (const m of q.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) out.add(`${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`);
  for (const m of q.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(`${m[1]}-${m[2]}-${m[3]}`);
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  for (const m of q.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/gi))
    out.add(`${m[3]}-${pad(months.indexOf(m[1].toLowerCase()) + 1)}-${pad(Number(m[2]))}`);
  return [...out];
}

/** Month-day pairs written in Chinese numerals: 十月十日 -> 10-10. */
export function statedMonthDays(quote: string): string[] {
  const out: string[] = [];
  for (const m of quote.matchAll(new RegExp(`(${CN_NUM})月(${CN_NUM})日`, "g"))) {
    const mo = cnInt(m[1]);
    const d = cnInt(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.push(`${pad(mo)}-${pad(d)}`);
  }
  return out;
}

export function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}
