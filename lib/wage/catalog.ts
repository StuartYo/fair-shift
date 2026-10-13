import type { Jurisdiction, NyRegion, RuleKey } from "./types";

// What each jurisdiction needs, where the official text lives, and how code
// checks a value. Seed URLs were fetched and read on 2026-10-13. They are hints:
// values are only accepted from text retrieved during the run.

export type ValueKind =
  | "amount" // hourly money amount, must appear in a quote
  | "extra_fraction" // quote states the extra (加給三分之一): multiplier = 1 + fraction
  | "literal_rate"; // quote states the full rate (一又三分之一, 加倍, 1 ½ times)

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
}



const MOL_HISTORY = "https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/";
const MOL_2027 = "https://www.mol.gov.tw/1607/1632/1633/99195/post";
const LSA_24 = "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=24";
const LSA_39 = "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=39";
const LSA_40 = "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=40";
export const MOL_HOURLY = "https://www.mol.gov.tw/1607/28162/28166/28180/28182/28188/29022/";
export const MOL_HOLIDAY_PAY = "https://www.mol.gov.tw/1607/28162/28166/28180/81521/81533/";
export const TW_HOLIDAY_ACT = "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0020095";
const NY_MW = "https://dol.ny.gov/minimum-wage-0";
const NY_P700 = "https://dol.ny.gov/system/files/documents/2025/12/p700_12-25.pdf";

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
    seedUrls: [LSA_24],
    query: "勞動基準法 第24條 延長工作時間在二小時以內者 加給三分之一",
    ask: "Labor Standards Act Art. 24: pay for the first 2 overtime hours. Quote only that clause.",
  },
  {
    key: "tw.ot_next2",
    jurisdiction: "TW",
    label: "Overtime, next 2 extra hours on a workday",
    kind: "extra_fraction",
    requiresDate: false,
    seedUrls: [LSA_24],
    query: "勞動基準法 第24條 再延長工作時間在二小時以內者 加給三分之二",
    ask: "Art. 24: pay for overtime hours 3 and 4. Quote only that clause.",
  },
  {
    key: "tw.rest_first2",
    jurisdiction: "TW",
    label: "Rest day work, first 2 hours",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [LSA_24, MOL_HOURLY],
    query: "勞動基準法 休息日工作 二小時以內 另再加給一又三分之一",
    ask: "Art. 24 para. 2: rest day (休息日) pay for the first 2 hours. Quote only that clause.",
  },
  {
    key: "tw.rest_after2",
    jurisdiction: "TW",
    label: "Rest day work, after 2 hours",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [LSA_24],
    query: "勞動基準法 休息日 工作二小時後再繼續工作者 另再加給一又三分之二",
    ask: "Art. 24 para. 2: rest day pay after the first 2 hours. Quote only that clause.",
  },
  {
    key: "tw.holiday",
    jurisdiction: "TW",
    label: "Work on a national holiday",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [LSA_39, MOL_HOLIDAY_PAY],
    query: "勞動基準法 第39條 休假日工作 工資應加倍發給",
    ask: "Art. 39: pay for working on a national holiday (休假日). Quote only that sentence.",
  },
  {
    key: "tw.day_off",
    jurisdiction: "TW",
    label: "Work on the regular day off (emergencies only)",
    kind: "literal_rate",
    requiresDate: false,
    seedUrls: [LSA_40],
    query: "勞動基準法 第40條 停止假期之工資 應加倍發給",
    ask: "Art. 40: pay when the employer suspends a day off. Quote only that sentence.",
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
];

export function specsFor(j: Jurisdiction): RuleSpec[] {
  return RULE_SPECS.filter((s) => s.jurisdiction === j);
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
