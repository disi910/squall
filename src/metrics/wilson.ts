/** A share of runs with its 95% confidence interval. */
export interface Proportion {
  rate: number
  lower: number
  upper: number
  successes: number
  n: number
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * Chosen over the textbook normal ("Wald") interval because our cells are
 * small (n = 100 per matrix cell, fewer when filtered) and rates are often
 * near 0% or 100%, where Wald intervals collapse to zero width or spill
 * outside [0, 1]. Wilson stays inside [0, 1] and keeps sensible width.
 *
 * Returns null for n = 0, so the UI can show "n/a" instead of a fake 0%.
 */
export function wilson(successes: number, n: number, z = 1.96): Proportion | null {
  if (!Number.isInteger(successes) || !Number.isInteger(n) || successes < 0 || successes > n)
    throw new RangeError(`wilson: need integers with 0 <= successes <= n, got ${successes}/${n}`)
  if (n === 0) return null

  const p = successes / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return {
    rate: p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
    successes,
    n,
  }
}
