/**
 * Pipeable utility.
 *
 * Enables `pipe(event, map(f), filter(p), take(10))` style composition
 * with full type inference up to 12 operators.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export function pipe<A>(source: A): A
export function pipe<A, B>(source: A, op1: (a: A) => B): B
export function pipe<A, B, C>(source: A, op1: (a: A) => B, op2: (b: B) => C): C
export function pipe<A, B, C, D>(source: A, op1: (a: A) => B, op2: (b: B) => C, op3: (c: C) => D): D
export function pipe<A, B, C, D, E>(
  source: A,
  op1: (a: A) => B,
  op2: (b: B) => C,
  op3: (c: C) => D,
  op4: (d: D) => E,
): E
export function pipe<A, B, C, D, E, F>(
  source: A,
  op1: (a: A) => B,
  op2: (b: B) => C,
  op3: (c: C) => D,
  op4: (d: D) => E,
  op5: (e: E) => F,
): F
export function pipe<A, B, C, D, E, F, G>(
  source: A,
  op1: (a: A) => B,
  op2: (b: B) => C,
  op3: (c: C) => D,
  op4: (d: D) => E,
  op5: (e: E) => F,
  op6: (f: F) => G,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  source: A,
  op1: (a: A) => B,
  op2: (b: B) => C,
  op3: (c: C) => D,
  op4: (d: D) => E,
  op5: (e: E) => F,
  op6: (f: F) => G,
  op7: (g: G) => H,
): H
export function pipe<A, B, C, D, E, F, G, H, I>(
  source: A,
  op1: (a: A) => B,
  op2: (b: B) => C,
  op3: (c: C) => D,
  op4: (d: D) => E,
  op5: (e: E) => F,
  op6: (f: F) => G,
  op7: (g: G) => H,
  op8: (h: H) => I,
): I
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  source: A,
  op1: (a: A) => B,
  op2: (b: B) => C,
  op3: (c: C) => D,
  op4: (d: D) => E,
  op5: (e: E) => F,
  op6: (f: F) => G,
  op7: (g: G) => H,
  op8: (h: H) => I,
  op9: (i: I) => J,
): J
export function pipe<A, B, C, D, E, F, G, H, I, J, K>(
  source: A,
  op1: (a: A) => B,
  op2: (b: B) => C,
  op3: (c: C) => D,
  op4: (d: D) => E,
  op5: (e: E) => F,
  op6: (f: F) => G,
  op7: (g: G) => H,
  op8: (h: H) => I,
  op9: (i: I) => J,
  op10: (j: J) => K,
): K
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L>(
  source: A,
  op1: (a: A) => B,
  op2: (b: B) => C,
  op3: (c: C) => D,
  op4: (d: D) => E,
  op5: (e: E) => F,
  op6: (f: F) => G,
  op7: (g: G) => H,
  op8: (h: H) => I,
  op9: (i: I) => J,
  op10: (j: J) => K,
  op11: (k: K) => L,
): L
export function pipe<A, B, C, D, E, F, G, H, I, J, K, L, M>(
  source: A,
  op1: (a: A) => B,
  op2: (b: B) => C,
  op3: (c: C) => D,
  op4: (d: D) => E,
  op5: (e: E) => F,
  op6: (f: F) => G,
  op7: (g: G) => H,
  op8: (h: H) => I,
  op9: (i: I) => J,
  op10: (j: J) => K,
  op11: (k: K) => L,
  op12: (l: L) => M,
): M
export function pipe(source: unknown, ...ops: Array<(x: unknown) => unknown>): unknown {
  let result = source
  for (const op of ops) {
    result = op(result)
  }
  return result
}
