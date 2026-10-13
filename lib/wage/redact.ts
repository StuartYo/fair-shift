// Strip personal identifiers before any text leaves the server (model or search).
// Fair Shift only needs dates, times, rates and amounts.

const PATTERNS: [RegExp, string][] = [
  [/[A-Z][12489]\d{8}/g, "[ID]"], // Taiwan national ID / ARC
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]"],
  [/(?:\+?886[-\s]?|0)9\d{2}[-\s]?\d{3}[-\s]?\d{3}/g, "[PHONE]"],
  [/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "[PHONE]"],
  [/(帳號|account(?: number)?|acct)\s*[:：]?\s*[\d-]{6,}/gi, "$1 [ACCOUNT]"],
  [/(姓名|員工姓名|員工|name|employee(?: name)?)\s*[:：]\s*[^\n,，;；|]{1,30}/gi, "$1: [NAME]"],
  [/(地址|address)\s*[:：]\s*[^\n]{1,80}/gi, "$1: [ADDRESS]"],
];

export function redact(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const [re, rep] of PATTERNS) {
    out = out.replace(re, (...args) => {
      count++;
      const groups = args.slice(1, -2);
      return rep.replace(/\$(\d)/g, (_m, i) => String(groups[Number(i) - 1] ?? ""));
    });
  }
  return { text: out, count };
}
