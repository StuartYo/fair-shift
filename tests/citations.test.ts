import { describe, expect, it } from "vitest";
import { DocStore } from "../lib/agent/citations";

const URL1 = "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0040001&flno=28";

function store() {
  const s = new DocStore();
  s.add({
    url: URL1,
    title: "Act Governing Food Safety and Sanitation, Art. 28",
    content: "其標示、宣傳或廣告，不得有不實、誇張或易生誤解之情形。 食品不得為醫療效能之標示、宣傳或廣告。",
    via: "fixture_extract",
    retrievedAt: "2026-10-13",
  });
  return s;
}

describe("citation verification", () => {
  it("accepts a verbatim quote", () => {
    expect(store().verify(URL1, "食品不得為醫療效能之標示、宣傳或廣告。").ok).toBe(true);
  });
  it("ignores whitespace and full-width vs half-width punctuation", () => {
    const s = store();
    expect(s.verify(URL1 + "#frag", "食品不得為醫療效能之標示、 宣傳或廣告").ok).toBe(true);
    s.add({ url: "https://www.ftc.gov/a", title: "a", content: "Ｆｕｌｌ－ｗｉｄｔｈ text，here", via: "fixture_extract", retrievedAt: "x" });
    expect(s.verify("https://www.ftc.gov/a", "Full-width text, here").ok).toBe(true);
  });
  it("rejects a paraphrase", () => {
    expect(store().verify(URL1, "食品廣告不可以宣稱醫療效果。").ok).toBe(false);
  });
  it("rejects a URL that was never retrieved", () => {
    expect(store().verify("https://law.moj.gov.tw/other", "食品不得為醫療效能之標示、宣傳或廣告。").ok).toBe(false);
  });
  it("rejects quotes too short to mean anything", () => {
    expect(store().verify(URL1, "食品").ok).toBe(false);
  });
});
