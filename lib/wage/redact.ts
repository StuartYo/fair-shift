// Strip personal identifiers before any text leaves the server (model or search).
// Fair Shift only needs dates, times, rates and amounts, so anything that looks
// like a name, a shop, a phone number or an account is replaced. This is a
// best-effort filter, not a guarantee: the page asks people to cover names too.

// Common Taiwanese surnames (single character). A short run of Chinese
// characters that starts with one of these and stands alone (not inside a
// longer word) is treated as a name, e.g. "王小明 0912...".
const SURNAMES = "陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁趙顏柯翁魏孫戴范方宋鄧杜傅侯溫薛丁卓馬阮董唐藍石蔣古紀姚連馮歐程湯黎田康姜白汪鄒尤巫鐘涂龔嚴韓袁金童陸夏柳邵錢伍倪溫于譚駱熊任甘秦顧毛章史官萬俞雷粘饒張";

// Words that start with a surname character but are schedule vocabulary.
const KEEP = new Set(["周一", "周二", "周三", "周四", "周五", "周六", "周日", "周末", "周休", "高雄", "方式", "石門", "金額", "金門", "連假", "連續", "任何", "史上", "官方", "萬元", "白班", "夏令", "毛額", "章程", "余額", "江南", "黃金週", "程式"]);

const CJK = "\\u3400-\\u9fff";

const PATTERNS: [RegExp, string][] = [
  [/[A-Z][12489]\d{8}/g, "[ID]"], // Taiwan national ID / ARC
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]"],
  [/(?:\+?886[-\s]?|0)9\d{2}[-\s]?\d{3}[-\s]?\d{3}/g, "[PHONE]"], // Taiwan mobile
  [/\(?0\d{1,2}\)?[-\s]?\d{3,4}[-\s]?\d{4}\b/g, "[PHONE]"], // Taiwan landline: 04-2284-0832, (02)8995-6866
  [/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "[PHONE]"], // US
  [/(統一編號|統編|tax id)\s*[:：]?\s*\d{8}/gi, "$1 [TAX ID]"],
  [/(帳號|帳戶|account(?: number)?|acct)\s*[:：]?\s*[\d-]{6,}/gi, "$1 [ACCOUNT]"],
  [/(?<![\d.,/:-])\d{9,16}(?![\d.,/:-])/g, "[NUMBER]"], // unlabeled account or card numbers
  [/(姓名|員工姓名|員工|同事|店長|主管|老闆|name|employee(?: name)?|manager)\s*[:：]\s*[^\n,，;；|\s\d、。]{1,12}/gi, "$1: [NAME]"],
  [/(地址|address)\s*[:：]\s*[^\n]{1,80}/gi, "$1: [ADDRESS]"],
  [/@[\w.㐀-鿿-]{2,30}/g, "[HANDLE]"], // LINE / IG mentions
  // Shop and company names: 全家北屯店, 好吃餐飲有限公司, 星巴克門市
  [new RegExp(`[${CJK}A-Za-z]{1,12}(?:股份有限公司|有限公司|企業社|工作室|商行|門市|分店|分公司|店)(?![長員鋪面家])`, "g"), "[SHOP]"],
  // Unlabeled Chinese names: a surname plus 1 or 2 characters, standing alone
  [new RegExp(`(?<![${CJK}])[${SURNAMES}][${CJK}]{1,2}(?![${CJK}])`, "g"), "\u0000NAME"],
];

export function redact(text: string): { text: string; count: number } {
  let count = 0;
  let out = text;
  for (const [re, rep] of PATTERNS) {
    out = out.replace(re, (...args) => {
      const match = args[0] as string;
      if (rep === "\u0000NAME") {
        if (KEEP.has(match) || /[一二三四五六日天末休]$/.test(match) && /^[周週]/.test(match)) return match;
        count++;
        return "[NAME]";
      }
      count++;
      const groups = args.slice(1, -2);
      return rep.replace(/\$(\d)/g, (_m, i) => String(groups[Number(i) - 1] ?? ""));
    });
  }
  return { text: out, count };
}
