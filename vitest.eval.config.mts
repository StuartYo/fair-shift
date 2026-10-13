import { defineConfig } from "vitest/config";

// Eval and feasibility runs. Unlike the unit tests, these use live providers
// whenever NEBIUS_API_KEY and TAVILY_API_KEY are set.
export default defineConfig({
  test: {
    include: ["eval/**/*.test.ts"],
    environment: "node",
  },
});
