import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { END, latestLiveResult, readmeBlock, START } from "../eval/readme-block";
import { DIAGNOSIS } from "../eval/realworld/diagnosis";
import { realworldBlock, realworldFiles, RW_END, RW_START } from "../eval/realworld/report";

// Every number in the README results blocks must come from the result files:
// the synthetic block from the newest live eval file, the real-world block from
// the live eval/results/realworld-*.json files. If this fails, run `npm run readme`.

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

  it("match the live real-world result files exactly", () => {
    const readme = readmeText();
    const a = readme.indexOf(RW_START);
    const b = readme.indexOf(RW_END);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(readme.slice(a, b + RW_END.length)).toBe(realworldBlock(realworldFiles(), DIAGNOSIS));
  });

  it("has no leftover placeholders or em dashes", () => {
    expect(readmeText()).not.toMatch(/TODO|pending \(needs API keys\)|—/);
  });
});
