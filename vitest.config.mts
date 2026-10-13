import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Tests never hit the network: force mock mode even if real keys exist.
    env: { APP_FORCE_MOCK: "1" },
  },
});
