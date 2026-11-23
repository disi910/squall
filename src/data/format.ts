import type { Proportion } from '../metrics/index.ts'

/** Whole percent, or "n/a" when there is no data. */
export const pct = (x: number | null | undefined) => (x == null ? 'n/a' : `${Math.round(x * 100)}%`)

/** "77–85" (percent, no sign), for a CI next to a rate. */
export const ciRange = (p: Proportion | null) =>
  p ? `${Math.round(p.lower * 100)}–${Math.round(p.upper * 100)}` : ''

export const fmtInt = (x: number | null | undefined) =>
  x == null ? 'n/a' : Math.round(x).toLocaleString('en-US')

/** 1234 -> "1.2k" */
export const fmtCompact = (x: number | null | undefined) =>
  x == null ? 'n/a' : x >= 1000 ? `${(x / 1000).toFixed(1)}k` : String(Math.round(x))
