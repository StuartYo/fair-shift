import { DGPA_CALENDARS } from "./holidays-tw";
import type { Jurisdiction, NyJob, NyRegion, RuleKey } from "./types";

// What each jurisdiction needs, where the official text lives, and how code
// checks a value. Seed URLs were fetched and read on 2026-10-13 (2026-10-14 for
// LSA Enforcement Rules Art. 20-1 and the NYS wage orders) and retrieved with
// Tavily extract on 2026-10-14 (eval/sources-probe.test.ts). They are hints:
// values are only accepted from text retrieved during the run.

export type ValueKind =
  | "amount" // hourly money amount, must appear in a quote
  | "extra_fraction" // quote states the extra (加給三分之一): multiplier = 1 + fraction
  | "literal_rate" // quote states the full rate (一又三分之一, 加倍, 1 ½ times)
  | "hours_limit"; // quote states an hours threshold (每週工作總時數超過四十小時, spread of hours exceeds 10)

export interface RuleSpec {
  key: RuleKey;
  jurisdiction: Jurisdiction;
  label: string;
  kind: ValueKind;
  requiresDate: boolean;
  seedUrls: string[];
  query: string;
  /** Plain description for the agent. */
  ask: string;
  /** New York: which job types need this rule. Default: all. */
  nyJobs?: NyJob[];
}



export const MOL_HISTORY = "https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/";
export const MOL_2027 = "https://www.mol.gov.tw/1607/1632/1633/99195/post";
// Labor Standards Act and its Enforcement Rules, full text on the Ministry of
// Labor's own law database (勞動法令查詢系統). Tavily extract returns the article
// text from these pages; from law.moj.gov.tw it returns only the page frame
// (checked 2026-10-14, basic and advanced extract). The law.moj.gov.tw links
// stay in the README for people.
export const LSA_ALL = "https://laws.mol.gov.tw/FLAW/FLAWDAT0201.aspx?id=FL014930";
export const LSA_RULES_ALL = "https://laws.mol.gov.tw/FLAW/FLAWDAT0201.aspx?id=FL014931";
export const MOL_HOURLY = "https://www.mol.gov.tw/1607/28162/28166/28180/28182/28188/29022/";
/**
 * 紀念日及節日實施條例 Art. 3 to 9, quoted verbatim on the DGPA government office
 * calendar page of each year (same source as the lunar holiday dates). law.moj.gov.tw
 * has the act too, but Tavily cannot read its article text.
 */
export function twHolidayActUrl(dates: string[] = []): string {
  const years = Object.keys(DGPA_CALENDARS).sort();
  const y = [...dates].sort().map((d) => d.slice(0, 4)).find((x) => years.includes(x)) ?? years[years.length - 1];
  return DGPA_CALENDARS[y].url;
}
const NY_MW = "https://dol.ny.gov/minimum-wage-0";
const NY_P700 = "https://dol.ny.gov/system/files/documents/2025/12/p700_12-25.pdf";
/** Hospitality Industry Wage Order, 12 NYCRR Part 146, CR 146 (09/24). Linked from https://dol.ny.gov/wage-orders */
export const NY_CR146 = "https://forms.labor.ny.gov/WP/CR146.pdf";
/** Miscellaneous Industries and Occupations Wage Order, 12 NYCRR Part 142. Linked from https://dol.ny.gov/wage-orders */
export const NY_CR142 = "https://forms.labor.ny.gov/WP/CR142.pdf";
const TIPPED: NyJob[] = ["food_service", "service"];
const HOSPITALITY: NyJob[] = ["hospitality", "food_service", "service"];

export const RULE_SPECS: RuleSpec[] = [
  {
    key: "tw.min_wage_hourly",
    jurisdiction: "TW",
    label: "Taiwan hourly minimum wage",
    kind: "amount",
    requiresDate: true,
    seedUrls: [MOL_HISTORY, MOL_2027],
    query: "每小時最低工資 自1月1日起實施 勞動部",
    ask: "Hourly minimum wage (每小時最低工資) and the date it takes effect. Record one entry per rate that covers the shift dates. Mark a rate that still awaits Executive Yuan approval as pending.",
  },
  {
    key: "tw.ot_first2",
    jurisdiction: "TW",
    label: "Overtime, first 2 extra hours on a workday",
    kind: "extra_fraction",
    requiresDate: false,
    seedUrls: [LSA_ALL],
    query: "勞動基準法 第24條 延長工作時間在二小時以內者 加給三分之一",
    ask: "Labor Standards Act Art. 24: pay for the first 2 overtime hours. Quote only that clause.",
  },
  {
    key: "tw.ot_next2",
    jurisdiction: "TW",
    label: "Overtime, next 2 extra hours on a workday",
    kind: "extra_fraction",
    requiresDate: false,
    seedUrls: [LSA_ALL],
    query: "勞動基準法 第24條 再延長工作時間在二小時以內者 加給三分之二",
    ask: "Art. 24: pay for overtime hours 3 and 4. Quote only that clause.",
  },
  {
    key: "tw.rest_first2",
    jurisdiction: "TW",
    label: "Rest day work, first 2 hours",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [LSA_ALL],
    query: "勞動基準法 休息日工作 二小時以內 另再加給一又三分之一",
    ask: "Art. 24 para. 2: rest day (休息日) pay for the first 2 hours. Quote only that clause.",
  },
  {
    key: "tw.rest_after2",
    jurisdiction: "TW",
    label: "Rest day work, after 2 hours",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [LSA_ALL],
    query: "勞動基準法 休息日 工作二小時後再繼續工作者 另再加給一又三分之二",
    ask: "Art. 24 para. 2: rest day pay after the first 2 hours. Quote only that clause.",
  },
  {
    key: "tw.holiday",
    jurisdiction: "TW",
    label: "Work on a national holiday",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [LSA_ALL],
    query: "勞動基準法 第39條 休假日工作 工資應加倍發給",
    ask: "Art. 39: pay for working on a national holiday (休假日). Quote only that sentence.",
  },
  {
    key: "tw.day_off",
    jurisdiction: "TW",
    label: "Work on the regular day off (emergencies only)",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [LSA_ALL],
    query: "勞動基準法 第40條 停止假期之工資 應加倍發給",
    ask: "Art. 40: pay when the employer suspends a day off. Quote only that sentence.",
  },
  {
    key: "tw.weekly_hours",
    jurisdiction: "TW",
    label: "Overtime starts after 40 hours a week",
    kind: "hours_limit",
    requiresDate: false,
    seedUrls: [LSA_RULES_ALL],
    query: "勞動基準法施行細則 第20條之1 延長勞工工作之時間 每週工作總時數超過四十小時之部分",
    ask: "LSA Enforcement Rules Art. 20-1: overtime includes the hours beyond a weekly total. Value is that weekly number of hours. Quote only that item.",
  },
  {
    key: "ny.min_wage_hourly",
    jurisdiction: "US-NY",
    label: "New York State hourly minimum wage",
    kind: "amount",
    requiresDate: true,
    seedUrls: [NY_P700, NY_MW],
    query: "New York State minimum wage per hour New York City Long Island Westchester remainder of state",
    ask: "Basic hourly minimum wage for the worker's region and the date range it applies to. Use one quote for the amount and one for the date if the page splits them.",
  },
  {
    key: "ny.ot_weekly",
    jurisdiction: "US-NY",
    label: "New York overtime after 40 hours a week",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [NY_P700],
    query: "New York overtime 40 hours 1 1/2 times regular wage",
    ask: "Overtime rate for hours beyond 40 in a workweek. Quote only that sentence.",
  },
  {
    key: "ny.tip_credit",
    jurisdiction: "US-NY",
    label: "New York tip credit",
    kind: "amount",
    requiresDate: true,
    seedUrls: [NY_CR146],
    query: "New York hospitality wage order tip credit food service worker Cash Wage Credit on and after January 1, 2026",
    ask: "12 NYCRR 146-1.3: the maximum tip credit per hour for the worker's region and tipped job (food service worker or service employee). Value is the Credit amount. Quote one rate line, e.g. '$11.35 Cash Wage, $5.65 Credit, $17.00 Total on and after January 1, 2026.' and set region and variant.",
    nyJobs: TIPPED,
  },
  {
    key: "ny.ot_tipped",
    jurisdiction: "US-NY",
    label: "Tipped overtime (1.5x before the tip credit)",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [NY_CR146],
    query: "New York tipped employee overtime rate regular rate before subtracting any tip credit multiplied by 1½ minus the tip credit",
    ask: "12 NYCRR 146-1.4: how overtime is paid when a tip credit is taken. Value is the multiplier. Quote only that sentence.",
    nyJobs: TIPPED,
  },
  {
    key: "ny.spread_hosp",
    jurisdiction: "US-NY",
    label: "Spread of hours over 10 (restaurants and hotels)",
    kind: "hours_limit",
    requiresDate: false,
    seedUrls: [NY_CR146],
    query: "New York hospitality spread of hours exceeds 10 one additional hour of pay at the basic minimum hourly rate",
    ask: "12 NYCRR 146-1.6(a): extra pay when the workday spans more than a number of hours. Value is that number of hours. Quote only clause (a).",
    nyJobs: HOSPITALITY,
  },
  {
    key: "ny.spread_misc",
    jurisdiction: "US-NY",
    label: "Spread of hours over 10 (other industries)",
    kind: "hours_limit",
    requiresDate: false,
    seedUrls: [NY_CR142],
    query: "New York miscellaneous wage order spread of hours exceeds 10 hours one hour's pay at the basic minimum hourly wage rate",
    ask: "12 NYCRR 142-2.4: one hour's pay at the minimum wage when the spread of hours exceeds a number of hours. Value is that number of hours. Quote the sentence through '(a) the spread of hours exceeds 10 hours;'.",
    nyJobs: ["general"],
  },
];

/** Rules a check needs. For New York this depends on the job type. */
export function specsFor(j: Jurisdiction, nyJob: NyJob = "general"): RuleSpec[] {
  return RULE_SPECS.filter((s) => s.jurisdiction === j && (j !== "US-NY" || !s.nyJobs || s.nyJobs.includes(nyJob)));
}

export const NY_JOB_LABEL: Record<NyJob, string> = {
  general: "Not tipped, not a restaurant or hotel",
  hospitality: "Restaurant or hotel, not tipped",
  food_service: "Tipped food server or bartender",
  service: "Other tipped service job",
};

export function isTipped(job?: NyJob): job is "food_service" | "service" {
  return job === "food_service" || job === "service";
}

export function isHospitality(job?: NyJob): boolean {
  return job === "hospitality" || isTipped(job);
}

export function specByKey(k: string): RuleSpec | undefined {
  return RULE_SPECS.find((s) => s.key === k);
}

/** Expected wording that identifies a region inside a New York quote. */
export const NY_REGION_WORDS: Record<NyRegion, RegExp> = {
  nyc: /New York City/i,
  li_westchester: /Long Island/i,
  rest: /(Remainder|rest) of (New York )?State/i,
};

export const NY_REGION_LABEL: Record<NyRegion, string> = {
  nyc: "New York City",
  li_westchester: "Long Island and Westchester",
  rest: "Rest of New York State",
};
