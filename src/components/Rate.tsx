import type { Proportion } from '../metrics/index.ts'
import { ciRange, pct } from '../data/format.ts'

/**
 * A 95% interval on a 0–100% track: the shaded band is the interval, the
 * tick is the point estimate. Drawn to scale, so bars in a column compare
 * directly.
 */
export function CIBar({ p, width = 76 }: { p: Proportion; width?: number }) {
  const x = (v: number) => 1 + v * (width - 2)
  return (
    <svg
      width={width}
      height={10}
      viewBox={`0 0 ${width} 10`}
      aria-hidden="true"
      className="block text-muted"
    >
      <rect x={0} y={4} width={width} height={2} rx={1} fill="var(--line-strong)" />
      <rect
        x={x(p.lower)}
        y={2}
        width={Math.max(2, x(p.upper) - x(p.lower))}
        height={6}
        rx={2}
        fill="currentColor"
        opacity={0.45}
      />
      <rect x={x(p.rate) - 1} y={0} width={2} height={10} fill="var(--fg)" />
    </svg>
  )
}

/** A rate with its interval and sample size. Every rate on the site goes through this (HANDOFF §10). */
export function Rate({ p }: { p: Proportion | null }) {
  if (!p) return <span className="font-mono text-xs text-faint">n/a</span>
  return (
    <span
      className="inline-grid grid-cols-[3.2em_76px] items-center gap-x-2"
      title={`${pct(p.rate)} (95% CI ${ciRange(p)}, n=${p.n})`}
    >
      <span className="text-right font-medium tabular-nums">{pct(p.rate)}</span>
      <CIBar p={p} />
      <span className="col-start-2 -mt-0.5 font-mono text-[11px] text-faint tabular-nums">
        [{ciRange(p)}] n={p.n}
      </span>
    </span>
  )
}
