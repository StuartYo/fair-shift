import { describe, expect, it } from "vitest";
import { isAllowedUrl, narrowDomains } from "../lib/domains";

const D = ["law.moj.gov.tw", "ftc.gov"];

describe("official domain allowlist", () => {
  it("accepts listed hosts and their subdomains", () => {
    expect(isAllowedUrl("https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0040001", D)).toBe(true);
    expect(isAllowedUrl("https://www.ftc.gov/business-guidance", D)).toBe(true);
  });
  it("rejects lookalikes, userinfo tricks and other schemes", () => {
    expect(isAllowedUrl("https://fakeftc.gov/x", D)).toBe(false);
    expect(isAllowedUrl("https://ftc.gov.evil.com/x", D)).toBe(false);
    expect(isAllowedUrl("https://law.moj.gov.tw@evil.com/x", D)).toBe(false);
    expect(isAllowedUrl("javascript:alert(1)", D)).toBe(false);
    expect(isAllowedUrl("not a url", D)).toBe(false);
  });
  it("narrows requested domains but never widens past the allowlist", () => {
    expect(narrowDomains(["ftc.gov"], D)).toEqual(["ftc.gov"]);
    expect(narrowDomains(["example.com"], D)).toEqual(D);
    expect(narrowDomains(undefined, D)).toEqual(D);
  });
});
