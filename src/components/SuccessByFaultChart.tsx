import { faultLabel } from '../data/labels.ts'
import { ciRange, pct } from '../data/format.ts'
import type { Findings } from '../data/findings.ts'

const W = 420
const H = 230
// The bottom pad fits the longest rotated fault label ("Contradiction") without clipping.
const PAD = { left: 34, right: 6, top: 10, bottom: 66 }

/**
 * Success rate per fault setting with 95% intervals, all agents pooled.
 * Hand-drawn SVG: one linear scale for bars, whiskers and gridlines.
 */
export function SuccessByFaultChart({ data }: { data: Findings['successByFault'] }) {
  const y = (v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom)
  const band = (W - PAD.left - PAD.right) / Math.max(1, data.length)
  const barW = band * 0.62

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full"
        role="img"
        aria-labelledby="sbf-title sbf-desc"
      >
        <title id="sbf-title">Success rate by fault, all agents pooled</title>
        <desc id="sbf-desc">
          {data
            .map((d) => `${faultLabel(d.key)}: ${pct(d.rate.rate)} (95% CI ${ciRange(d.rate)})`)
            .join('; ')}
        </desc>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(g)}
              y2={y(g)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y(g) + 3.5}
              textAnchor="end"
              fontSize={10}
              fill="var(--faint)"
              fontFamily="var(--font-mono)"
            >
              {g * 100}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * band + (band - barW) / 2
          const cx = x + barW / 2
          const baseline = d.key === 'none'
          return (
            <g key={d.key}>
              <rect
                x={x}
                y={y(d.rate.rate)}
                width={barW}
                height={y(0) - y(d.rate.rate)}
                rx={2}
                fill={baseline ? 'var(--muted)' : 'var(--fault)'}
                opacity={0.88}
              />
              <line
                x1={cx}
                x2={cx}
                y1={y(d.rate.upper)}
                y2={y(d.rate.lower)}
                stroke="var(--fg)"
                strokeWidth={1.5}
              />
              <line
                x1={cx - 3}
                x2={cx + 3}
                y1={y(d.rate.upper)}
                y2={y(d.rate.upper)}
                stroke="var(--fg)"
                strokeWidth={1.5}
              />
              <line
                x1={cx - 3}
                x2={cx + 3}
                y1={y(d.rate.lower)}
                y2={y(d.rate.lower)}
                stroke="var(--fg)"
                strokeWidth={1.5}
              />
              <text
                x={cx}
                y={H - PAD.bottom + 13}
                textAnchor="end"
                fontSize={10}
                fill="var(--muted)"
                fontFamily="var(--font-mono)"
                transform={`rotate(-35 ${cx} ${H - PAD.bottom + 13})`}
              >
                {faultLabel(d.key, true)}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
