import { defineConfig } from "vitest/config";

const isCI = process.env.CI === "true" || process.env.CI === "1";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.js"],
    // In CI, run test files sequentially to ensure correct data flow
    // (account-creation before account-data, init-passkey before transaction-passkey, etc.)
    fileParallelism: !isCI,
  },
});
