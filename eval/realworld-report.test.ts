import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { DIAGNOSIS } from "./realworld/diagnosis";
import { realworldMarkdown, type RealworldResult } from "./realworld/report";

// npm run eval:realworld:report
// Re-renders eval/results/realworld-*.md from the JSON files (never changed) and
// the diagnosis written after each run (eval/realworld/diagnosis.ts).
it("re-renders the real-world reports", () => {
  for (const f of readdirSync("eval/results").filter((x) => /^realworld-.*\.json$/.test(x))) {
    const stem = f.replace(/\.json$/, "");
    const res = JSON.parse(readFileSync(`eval/results/${f}`, "utf8")) as RealworldResult;
    writeFileSync(`eval/results/${stem}.md`, realworldMarkdown(stem, res, DIAGNOSIS[stem]));
  }
});
