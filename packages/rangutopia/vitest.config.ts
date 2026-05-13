import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
