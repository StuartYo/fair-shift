import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { latestLiveResult, readmeBlock, replaceBlock } from "./readme-block";

// npm run readme: rewrite the results block in README.md from the newest live eval file.
it("writes the README results block", () => {
  const { file, summary, rows } = latestLiveResult();
  const readme = readFileSync("README.md", "utf8");
  writeFileSync("README.md", replaceBlock(readme, readmeBlock(file, summary, rows)));
});
