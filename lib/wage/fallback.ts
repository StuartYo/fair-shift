import type { RetrievedDoc } from "../types";
import { statedDates, statedRates } from "./numbers";
import type { ProposedHoliday, ProposedRule } from "./verify";
import type { RuleKey } from "./types";

// Deterministic extraction from retrieved official text. Used when the agent
// did not record a rule (model error, budget stop, or demo mode). Everything
// proposed here still goes through verifyRule / verifyHoliday.

const CLAUSES: Partial<Record<RuleKey, RegExp>> = {
  "tw.ot_first2": /(?<!再)延長工作時間在二小時以內者，按平日每小時工資額加給三分之一以上。/,
  "tw.ot_next2": /再延長工作時間在二小時以內者，按平日每小時工資額加給三分之二以上。/,
  "tw.rest_first2": /雇主使勞工於第三十六條所定休息日工作，工作時間在二小時以內者，其工資按平日每小時工資額另再加給一又三分之一以上/,
  "tw.rest_after2": /工作二小時後再繼續工作者，按平日每小時工資額另再加給一又三分之二以上。/,
  "tw.holiday": /雇主經徵得勞工同意於休假日工作者，工資應加倍發給。/,
  "tw.day_off": /但停止假期之工資，應加倍發給/,
  "ny.ot_weekly": /A standard work week is 40 hours\. If employees work any hours beyond that, then the employer must pay them at 1 ½ times the regular wage\./,
};

export function fallbackRules(docs: RetrievedDoc[], keys: RuleKey[]): ProposedRule[] {
  const out: ProposedRule[] = [];
  for (const d of docs) {
    const text = d.content.replace(/\s+/g, " ");
    for (const key of keys) {
      const re = CLAUSES[key];
      if (re) {
        const m = text.match(re);
        if (m) {
          const r = statedRates(m[0]);
          if (r.length === 1) {
            const value = key === "tw.ot_first2" || key === "tw.ot_next2" ? 1 + r[0] : r[0];
            out.push({ key, value, citations: [{ source_url: d.url, quote: m[0] }] });
          }
        }
      }
      if (key === "tw.min_wage_hourly") {
        for (const m of text.matchAll(/民國\d+年\d+月\d+日發布，自(\d+)年(\d+)月(\d+)日起實施，訂定每月最低工資為[\d,]+元，每小時最低工資為(\d+)元。/g)) {
          out.push({ key, value: Number(m[4]), effective_from: statedDates(m[0]).find((x) => x.endsWith("-01-01")) ?? statedDates(m[0])[1], citations: [{ source_url: d.url, quote: m[0] }] });
        }
        for (const m of text.matchAll(/決定自(\d+)年(\d+)月(\d+)日起，[^。]*?每小時最低工資[^。]*?至(\d+)元。調整案將由勞動部陳報行政院核定。/g)) {
          out.push({ key, value: Number(m[4]), effective_from: statedDates(m[0])[0], citations: [{ source_url: d.url, quote: m[0] }] });
        }
      }
      if (key === "ny.min_wage_hourly") {
        const range = text.match(/From (\d{2}\/\d{2}\/\d{4}) to (\d{2}\/\d{2}\/\d{4}), the New York State basic minimum wage is:/);
        if (range) {
          const [from, to] = statedDates(range[0]);
          const regions: [string, RegExp][] = [
            ["nyc", /\$(\d+\.\d{2}) per hour in New York City/],
            ["li_westchester", /\$(\d+\.\d{2}) per hour in Long Island and Westchester County/],
            ["rest", /\$(\d+\.\d{2}) per hour in the Remainder of New York State/],
          ];
          for (const [region, re2] of regions) {
            const m = text.match(re2);
            if (m)
              out.push({
                key,
                region,
                value: Number(m[1]),
                effective_from: from,
                effective_to: to,
                citations: [
                  { source_url: d.url, quote: m[0] },
                  { source_url: d.url, quote: range[0] },
                ],
              });
          }
        }
        const next = text.match(
          /On January 1, (\d{4}), New York.s minimum wage will stay the same\. The minimum wage rates will be: \$(\d+\.\d{2}) per hour in New York City, Long Island, and Westchester County \$(\d+\.\d{2}) per hour in the rest of New York State/,
        );
        if (next) {
          const from = `${next[1]}-01-01`;
          for (const [region, v] of [
            ["nyc", next[2]],
            ["li_westchester", next[2]],
            ["rest", next[3]],
          ] as const)
            out.push({ key, region, value: Number(v), effective_from: from, citations: [{ source_url: d.url, quote: next[0] }] });
        }
      }
    }
  }
  return out;
}

/** Solar-date holidays that are days off, from 紀念日及節日實施條例 Art. 3 to 6. */
export function fallbackHolidays(docs: RetrievedDoc[]): ProposedHoliday[] {
  const out: ProposedHoliday[] = [];
  for (const d of docs) {
    const text = d.content.replace(/\s+/g, " ");
    const art4 = text.match(/下列紀念日均放假一日，其餘均不放假：[^第]*/);
    const art6 = text.match(/[一二]、[^、：]*節[^：]*：均放假一日。/g) || [];
    const offQuotes = [art4?.[0].trim(), ...art6.map((s) => s.trim())].filter(Boolean) as string[];
    if (offQuotes.length === 0) continue;
    for (const m of text.matchAll(/、([^、：。\s]{2,20})：([一二三四五六七八九十]+月[一二三四五六七八九十]+日)/g)) {
      const name = m[1];
      const off = offQuotes.find((q) => q.includes(name));
      if (!off) continue;
      const md = m[2].match(/([一二三四五六七八九十]+)月([一二三四五六七八九十]+)日/)!;
      const toN = (s: string) => {
        const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
        if (s === "十") return 10;
        if (s.startsWith("十")) return 10 + (map[s[1]] || 0);
        if (s.includes("十")) return map[s[0]] * 10 + (map[s[2]] || 0);
        return map[s];
      };
      const month_day = `${String(toN(md[1])).padStart(2, "0")}-${String(toN(md[2])).padStart(2, "0")}`;
      out.push({
        month_day,
        name,
        citations: [
          { source_url: d.url, quote: `${name}：${m[2]}` },
          { source_url: d.url, quote: off },
        ],
      });
    }
  }
  return out;
}
