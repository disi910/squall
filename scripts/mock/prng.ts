/**
 * Deterministic randomness for the mock data. A tiny hand-rolled PRNG instead
 * of a dependency like seedrandom: ten lines, no install, and the output is
 * identical on every platform and Node version.
 */

/** FNV-1a 32-bit hash: turns a string into a well-mixed seed. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32: a small, fast 32-bit generator returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A generator keyed by named parts, e.g. rngFor('latent', agentId, taskId, seed).
 * Each decision gets its own stream, so adding a new random draw somewhere
 * does not shift every number after it.
 */
export const rngFor = (...parts: (string | number)[]) => mulberry32(hashString(parts.join('|')))
