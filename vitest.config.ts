import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "aeon-types": path.resolve(__dirname, "packages/types/src/index.ts"),
      "aeon-core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "aeon-scheduler": path.resolve(__dirname, "packages/scheduler/src/index.ts"),
      "aeon-test": path.resolve(__dirname, "packages/test/src/index.ts"),
      "aeon-dom": path.resolve(__dirname, "packages/dom/src/index.ts"),
      "aeon-devtools": path.resolve(__dirname, "packages/devtools/src/index.ts"),
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
