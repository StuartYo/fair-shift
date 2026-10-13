import type { Computation, RuleRecord, Shift } from "./types";

// Explanation and a message to the employer. The model may write these in live
// mode, but every number it uses must already exist in the computation; if not,
// the code template is used instead.

const money = (n: number, c: "TWD" | "USD") => (c === "TWD" ? `NT$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`);

export function hasCJK(s: string): boolean {
  return /[㐀-鿿]/.test(s);
}

export function templateExplanation(c: Computation, shifts: Shift[], zh: boolean): { text: string; messageToEmployer: string } {
  const cur = c.currency;
  const exp = money(c.expectedTotal, cur);
  const paid = c.paidTotal !== undefined ? money(c.paidTotal, cur) : null;
  const gap = c.shortfall !== undefined && c.shortfall > 0 ? money(c.shortfall, cur) : null;
  const special = shifts.filter((s) => s.dayType !== "workday");
  const text = [
    `You worked ${c.workedHours} hours across ${shifts.length} shift(s). Based on the official rules retrieved, the expected pay is ${exp}.`,
    paid ? `The payslip shows ${paid}.` : "No total was found on the payslip.",
    gap ? `That is ${gap} less than expected.` : paid ? "No shortfall was found." : "",
    c.components.premiums > 0 ? `Extra pay for overtime, rest day, holiday or long-day (spread of hours) work accounts for ${money(c.components.premiums, cur)} of the expected total.` : "",
    c.components.minWageTopUp > 0 ? `Raising the stated rate to the minimum wage adds ${money(c.components.minWageTopUp, cur)}.` : "",
    special.length ? `Special days: ${special.map((s) => `${s.date} (${s.dayType.replace(/_/g, " ")}${s.holidayName ? `, ${s.holidayName}` : ""})`).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const messageToEmployer = zh
    ? [
        "您好，",
        `我核對了這期的班表與薪資單：總工時 ${c.workedHours} 小時，依勞動部公告與勞動基準法計算，應領 ${exp}${paid ? `，實領 ${paid}` : ""}${gap ? `，差額 ${gap}` : ""}。`,
        special.length
          ? `其中 ${special.map((s) => s.date).join("、")} 屬於休息日或國定假日出勤，依法應另計加給。`
          : c.components.premiums > 0
            ? "其中有超過每日 8 小時或每週 40 小時的工時，依法屬於延長工時，應另計加給。"
            : "",
        "附上計算明細與官方條文連結，想請您協助確認，若有我算錯的地方也請告訴我。謝謝！",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        "Hi,",
        `I checked my schedule against my payslip for this period. I worked ${c.workedHours} hours. Using the state's published rules, I expected ${exp}${paid ? ` and received ${paid}` : ""}${gap ? `, a difference of ${gap}` : ""}.`,
        "I have attached the line-by-line calculation with links to the official rules. Could you take a look? If I have missed something, please let me know.",
        "Thank you.",
      ].join("\n");
  return { text, messageToEmployer };
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
  for (const r of rules) add(r.value);
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
