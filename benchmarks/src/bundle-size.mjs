#!/usr/bin/env node
/**
 * Bundle size audit.
 *
 * Measures the minified + gzipped + brotli size of:
 *   1. Per-package dist (what npm publishes)
 *   2. Tree-shaken bundles for representative import patterns
 *
 * Run from the repo root:
 *   node benchmarks/src/bundle-size.mjs
 *
 * Requires that all packages have been built first (`pnpm -r build`).
 */

import { build } from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const fixtureDir = join(repoRoot, "benchmarks/.bundle-fixtures");

const PACKAGES = ["types", "scheduler", "core", "dom", "devtools", "test"];

const FIXTURES = [
  {
    name: "minimal — now, map, observe + DefaultScheduler",
    code: `
      import { now, map, observe } from "aeon-core";
      import { DefaultScheduler } from "aeon-scheduler";
      const e = map((x) => x + 1, now(1));
      observe((x) => x, e, new DefaultScheduler());
    `,
  },
  {
    name: "typical (data-first) — fromArray, filter, map, scan, take, observe",
    code: `
      import { fromArray, filter, map, scan, take, observe } from "aeon-core";
      import { DefaultScheduler } from "aeon-scheduler";
      const e = take(3, scan((a, x) => a + x, 0, map((x) => x * 2,
        filter((x) => x % 2 === 0, fromArray([1,2,3,4,5,6,7,8,9,10])))));
      observe((x) => x, e, new DefaultScheduler());
    `,
  },
  {
    name: "typical (pipe + P.* namespace, less tree-shakeable)",
    code: `
      import { fromArray, pipe, P, observe } from "aeon-core";
      import { DefaultScheduler } from "aeon-scheduler";
      const e = pipe(
        fromArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
        P.filter((x) => x % 2 === 0),
        P.map((x) => x * 2),
        P.scan((acc, x) => acc + x, 0),
        P.take(3),
      );
      observe((x) => x, e, new DefaultScheduler());
    `,
  },
  {
    name: "aeon-core (all combinators, full re-export)",
    code: `export * from "aeon-core";`,
  },
  {
    name: "aeon-core + aeon-scheduler (full re-export)",
    code: `
      export * from "aeon-core";
      export * from "aeon-scheduler";
    `,
  },
];

function fmt(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

function pad(s, n) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padRight(s, n) {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

async function measureFixture(name, code) {
  if (!existsSync(fixtureDir)) mkdirSync(fixtureDir, { recursive: true });
  const file = join(fixtureDir, name.replace(/[^a-z0-9]+/gi, "-") + ".mjs");
  writeFileSync(file, code);

  const result = await build({
    entryPoints: [file],
    bundle: true,
    minify: true,
    write: false,
    format: "esm",
    target: "es2022",
    platform: "browser",
    treeShaking: true,
    absWorkingDir: repoRoot,
  });
  const out = result.outputFiles[0].contents;
  const gz = gzipSync(out, { level: 9 });
  const br = brotliCompressSync(out);
  return { min: out.length, gzip: gz.length, brotli: br.length };
}

async function measurePackage(pkg) {
  const distFile = join(repoRoot, "packages", pkg, "dist", "index.js");
  if (!existsSync(distFile)) return null;
  const raw = readFileSync(distFile);
  const result = await build({
    stdin: { contents: raw.toString(), loader: "js", resolveDir: dirname(distFile) },
    bundle: false,
    minify: true,
    write: false,
    format: "esm",
    target: "es2022",
  });
  const min = result.outputFiles[0].contents;
  const gz = gzipSync(min, { level: 9 });
  const br = brotliCompressSync(min);
  return { raw: raw.length, min: min.length, gzip: gz.length, brotli: br.length };
}

async function main() {
  console.log("Aeon bundle size audit");
  console.log("=".repeat(80));
  console.log();

  console.log("Per-package dist (single-file, no cross-package inlining)");
  console.log("-".repeat(80));
  console.log(
    pad("package", 18),
    padRight("raw", 10),
    padRight("min", 10),
    padRight("min+gzip", 12),
    padRight("min+brotli", 12),
  );
  for (const pkg of PACKAGES) {
    const r = await measurePackage(pkg);
    if (!r) continue;
    console.log(
      pad("aeon-" + pkg, 18),
      padRight(fmt(r.raw), 10),
      padRight(fmt(r.min), 10),
      padRight(fmt(r.gzip), 12),
      padRight(fmt(r.brotli), 12),
    );
  }
  console.log();

  console.log("Bundled fixtures (tree-shaken, what users actually ship)");
  console.log("-".repeat(80));
  console.log(pad("entry", 56), padRight("min+gzip", 12), padRight("min+brotli", 12));
  for (const fx of FIXTURES) {
    const r = await measureFixture(fx.name, fx.code);
    console.log(pad(fx.name, 56), padRight(fmt(r.gzip), 12), padRight(fmt(r.brotli), 12));
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
