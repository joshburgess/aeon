import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@pulse/types": path.resolve(__dirname, "packages/types/src/index.ts"),
      "@pulse/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@pulse/scheduler": path.resolve(__dirname, "packages/scheduler/src/index.ts"),
      "@pulse/test": path.resolve(__dirname, "packages/test/src/index.ts"),
      "@pulse/dom": path.resolve(__dirname, "packages/dom/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    passWithNoTests: true,
  },
  bench: {
    include: ["benchmarks/src/**/*.bench.ts"],
  },
});
