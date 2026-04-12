#!/usr/bin/env node
/**
 * Drift check: verifies that the verbatim Effect-TS copies in
 * `packages/types/src/hkt.ts` still match upstream.
 *
 * Fetches the canonical `HKT.ts` and `Types.ts` from Effect-TS's main
 * branch, extracts the specific definitions we care about (`TypeLambda`,
 * `Kind`, `Invariant`, `Covariant`, `Contravariant`), extracts the same
 * definitions from our local copy, and compares them after whitespace
 * normalization.
 *
 * Exits 0 if everything matches, non-zero with a diff if anything drifts.
 *
 * Run locally:    node scripts/check-hkt-drift.mjs
 * Run in CI:      called by .github/workflows/ci.yml
 *
 * Zero dependencies — uses Node 18+ native fetch.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCAL_HKT = resolve(__dirname, "../packages/types/src/hkt.ts");

const UPSTREAM_HKT =
  "https://raw.githubusercontent.com/Effect-TS/effect/main/packages/effect/src/HKT.ts";
const UPSTREAM_TYPES =
  "https://raw.githubusercontent.com/Effect-TS/effect/main/packages/effect/src/Types.ts";

// Each check extracts a named block via regex (multiline, DOTALL-ish via [\s\S])
// and compares after whitespace collapse. The regexes are deliberately
// anchored on `export` so we don't match the wrong occurrence.
const checks = [
  {
    name: "TypeLambda interface",
    upstream: UPSTREAM_HKT,
    regex: /export interface TypeLambda \{[\s\S]*?\n\}/,
  },
  {
    name: "Kind type",
    upstream: UPSTREAM_HKT,
    regex:
      /export type Kind<F extends TypeLambda, In, Out2, Out1, Target> =[\s\S]*?\n  \}/,
  },
  {
    name: "Invariant type",
    upstream: UPSTREAM_TYPES,
    regex: /export type Invariant<A> = \(_: A\) => A/,
  },
  {
    name: "Covariant type",
    upstream: UPSTREAM_TYPES,
    regex: /export type Covariant<A> = \(_: never\) => A/,
  },
  {
    name: "Contravariant type",
    upstream: UPSTREAM_TYPES,
    regex: /export type Contravariant<A> = \(_: A\) => void/,
  },
];

// Normalize: collapse runs of whitespace to a single space, trim ends.
// Keeps structure comparable while ignoring trailing-newline /
// indentation noise.
const normalize = (s) => s.replace(/\s+/g, " ").trim();

const extract = (source, regex, label) => {
  const match = source.match(regex);
  if (!match) {
    throw new Error(
      `Could not extract ${label} — regex did not match. ` +
        `Either upstream changed shape dramatically or our regex is stale.`,
    );
  }
  return normalize(match[0]);
};

const fetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Fetch failed for ${url}: ${res.status} ${res.statusText}`);
  }
  return await res.text();
};

const main = async () => {
  const localSource = readFileSync(LOCAL_HKT, "utf8");

  // Fetch both upstream files once and cache by URL.
  const upstreamCache = new Map();
  const getUpstream = async (url) => {
    if (!upstreamCache.has(url)) {
      upstreamCache.set(url, await fetchText(url));
    }
    return upstreamCache.get(url);
  };

  const failures = [];

  for (const check of checks) {
    const upstreamSource = await getUpstream(check.upstream);
    const upstreamExtracted = extract(
      upstreamSource,
      check.regex,
      `upstream ${check.name}`,
    );
    const localExtracted = extract(
      localSource,
      check.regex,
      `local ${check.name}`,
    );

    if (upstreamExtracted !== localExtracted) {
      failures.push({
        name: check.name,
        upstream: upstreamExtracted,
        local: localExtracted,
      });
    } else {
      console.log(`  OK  ${check.name}`);
    }
  }

  if (failures.length > 0) {
    console.error("\n✗ HKT drift detected — Effect upstream has changed.\n");
    for (const f of failures) {
      console.error(`--- ${f.name} ---`);
      console.error(`upstream: ${f.upstream}`);
      console.error(`local:    ${f.local}\n`);
    }
    console.error(
      "Update packages/types/src/hkt.ts to match upstream, re-run the\n" +
        "test suite, and commit the result. Do not modify the verbatim\n" +
        "block to differ from upstream — the whole point of the drift\n" +
        "check is that we stay structurally identical to Effect.",
    );
    process.exit(1);
  }

  console.log("\n✓ All Effect HKT definitions match upstream.");
};

main().catch((err) => {
  console.error(`✗ Drift check failed: ${err.message}`);
  process.exit(1);
});
