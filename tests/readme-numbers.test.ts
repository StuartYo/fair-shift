import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { END, latestLiveResult, readmeBlock, START } from "../eval/readme-block";

// Every number in the README results block must come from the newest live eval
// file. If this fails, run `npm run readme` (or rerun `npm run eval`).

const readmeText = () => readFileSync("README.md", "utf8").replace(/\r\n/g, "\n");

describe("README numbers", () => {
  it("match the newest live eval result file exactly", () => {
    const { file, summary, rows } = latestLiveResult();
    const readme = readmeText();
    const a = readme.indexOf(START);
    const b = readme.indexOf(END);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(readme.slice(a, b + END.length)).toBe(readmeBlock(file, summary, rows));
  });

  it("has no leftover placeholders or em dashes", () => {
    expect(readmeText()).not.toMatch(/TODO|pending \(needs API keys\)|—/);
  });
});
