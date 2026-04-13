// aeon-test — Marble testing DSL, collection helpers, assertions

// Re-export VirtualScheduler for convenience
export { VirtualScheduler } from "aeon-scheduler"

// Marble notation
export { parseMarble, marbleDuration } from "./marble.js"
export type { MarbleEntry } from "./marble.js"

// Test stream creation
export { testEvent } from "./testEvent.js"

// Collection helpers
export { collectEvents, collectSync } from "./collect.js"
export type { CollectedEntry, CollectResult } from "./collect.js"

// Assertions
export { assertEvents } from "./assert.js"
