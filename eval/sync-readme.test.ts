import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { latestLiveResult, readmeBlock, replaceBlock } from "./readme-block";
import { DIAGNOSIS } from "./realworld/diagnosis";
import { realworldBlock, realworldFiles, replaceRealworldBlock } from "./realworld/report";

// npm run readme: rewrite the results blocks in README.md from the newest live
// eval file and from the live real-world result files.
it("writes the README results blocks", () => {
  const { file, summary, rows } = latestLiveResult();
  let readme = readFileSync("README.md", "utf8");
  readme = replaceBlock(readme, readmeBlock(file, summary, rows));
  readme = replaceRealworldBlock(readme, realworldBlock(realworldFiles(), DIAGNOSIS));
  writeFileSync("README.md", readme);
});
