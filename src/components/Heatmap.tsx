import { useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { Analysis, MatrixCell } from '../data/analysis.ts'
import { ciRange, pct } from '../data/format.ts'
import { DESIGN_LABEL, faultLabel } from '../data/labels.ts'
import type { Proportion } from '../metrics/index.ts'
import { usePrefersLight } from './usePrefersLight.ts'

export interface HeatmapMetric {
  id: 'success' | 'safety' | 'recovery'
  label: string
  /** Legend title. */
  legend: string
  /** CSS color the ramp runs toward. */
  color: string
  /** Rates at or below domain[0] get the lightest color, at or above domain[1] the strongest. */
  domain: [number, number]
  value: (cell: MatrixCell) => Proportion | null
}

interface HeatmapProps {
  analysis: Analysis
  metric: HeatmapMetric
  onOpen: (agentId: string, faultKey: string) => void
}

// Geometry, in SVG units. The SVG scales to its container; on narrow screens the container scrolls instead.
const MODEL_W = 104
const DESIGN_W = 150
const TOP = 34
const CELL_W = 80
const CELL_H = 42
const GAP = 3
const GROUP_GAP = 12
const TIP_W = 264

/**
 * Where along the ramp the cell text switches from the normal text color to
 * --heat-ink. Chosen per theme so both sides keep at least 4.5:1 contrast:
 * the light ramp ends in a dark teal (switch late), the dark ramp in a bright
 * teal (switch early).
 */
const INK_SWITCH = { light: 0.8, dark: 0.55 }

/** How often the fault reached the agent in this cell; empty for simulated data and the baseline. */
const exposureText = (cell: MatrixCell | undefined) =>
  cell?.exposure
    ? `The fault reached the agent in ${cell.exposure.successes} of ${cell.exposure.n} runs.`
    : ''

const splitModel = (label: string) => {
  const m = label.match(/^(.*?) \((.*)\)$/)
  return m ? { name: m[1]!, size: m[2]! } : { name: label, size: '' }
}

/**
 * The robustness matrix: agent configs (rows, grouped by model) × fault
 * settings (columns). Hand-drawn SVG so the encoding is exactly what we want:
 * one sequential color ramp per metric, the rate and its CI half-width in
 * every cell, and full keyboard support (one Tab stop, arrows move, Enter
 * opens the runs).
 */
export function Heatmap({ analysis, metric, onOpen }: HeatmapProps) {
  const { agents, faultKeys, matrix } = analysis
  const inkSwitch = usePrefersLight() ? INK_SWITCH.light : INK_SWITCH.dark
  const [active, setActive] = useState<[number, number]>([0, 0])
  const [tip, setTip] = useState<{ r: number; c: number; x: number; y: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const cellRefs = useRef(new Map<string, SVGGElement>())

  // Group consecutive rows that share a model, so each model gets one label and a gap below it.
  const groupOf: number[] = []
  agents.forEach((a, i) => {
    const prev = agents[i - 1]
    groupOf.push(i === 0 ? 0 : groupOf[i - 1]! + (prev && prev.modelLabel !== a.modelLabel ? 1 : 0))
  })
  const groups = groupOf.at(-1)! + 1
  const rowY = (r: number) => TOP + r * (CELL_H + GAP) + groupOf[r]! * GROUP_GAP
  const colX = (c: number) => MODEL_W + DESIGN_W + c * (CELL_W + GAP)
  const width = colX(faultKeys.length) + 2
  const height = TOP + agents.length * (CELL_H + GAP) + (groups - 1) * GROUP_GAP + 4

  const cellAt = (r: number, c: number) => matrix[agents[r]!.id]?.[faultKeys[c]!]

  // Tooltip position relative to the container, clamped so it never overflows the right edge.
  const showTip = (r: number, c: number, clientX: number, clientY: number) => {
    const box = boxRef.current?.getBoundingClientRect()
    if (!box) return
    const x = Math.max(0, Math.min(clientX - box.left, box.width - TIP_W))
    setTip({ r, c, x, y: clientY - box.top })
  }
  const tipFromElement = (r: number, c: number, el: Element) => {
    const rect = el.getBoundingClientRect()
    showTip(r, c, rect.right + 8, rect.top)
  }
  const tipFromMouse = (r: number, c: number, e: MouseEvent) =>
    showTip(r, c, e.clientX + 14, e.clientY + 14)

  const moveTo = (r: number, c: number) => {
    const nr = Math.max(0, Math.min(agents.length - 1, r))
    const nc = Math.max(0, Math.min(faultKeys.length - 1, c))
    setActive([nr, nc])
    cellRefs.current.get(`${nr}:${nc}`)?.focus()
  }
  const onKeyDown = (e: KeyboardEvent, r: number, c: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [r - 1, c],
      ArrowDown: [r + 1, c],
      ArrowLeft: [r, c - 1],
      ArrowRight: [r, c + 1],
      Home: [r, 0],
      End: [r, faultKeys.length - 1],
    }
    const target = moves[e.key]
    if (target) {
      e.preventDefault()
      moveTo(...target)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(agents[r]!.id, faultKeys[c]!)
    }
  }

  const tipCell = tip ? cellAt(tip.r, tip.c) : undefined
  const tipValue = tipCell ? metric.value(tipCell) : null

  return (
    <div ref={boxRef} className="relative">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full min-w-[760px]"
          role="grid"
          aria-label={`${metric.legend} by agent configuration and fault`}
          aria-rowcount={agents.length + 1}
          aria-colcount={faultKeys.length + 1}
        >
          <g role="row">
            {faultKeys.map((key, c) => (
              <g key={key} role="columnheader">
                <text
                  x={colX(c) + CELL_W / 2}
                  y={TOP - 14}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={500}
                  fill={key === 'none' ? 'var(--fg)' : 'var(--fault)'}
                  fontFamily="var(--font-sans)"
                >
                  {faultLabel(key, true)}
                </text>
              </g>
            ))}
          </g>

          {Array.from({ length: groups }, (_, g) => {
            const rows = agents.map((_, r) => r).filter((r) => groupOf[r] === g)
            const y0 = rowY(rows[0]!)
            const y1 = rowY(rows.at(-1)!) + CELL_H
            const { name, size } = splitModel(agents[rows[0]!]!.modelLabel)
            return (
              <g key={g} aria-hidden="true">
                <text
                  x={0}
                  y={(y0 + y1) / 2 - 4}
                  fontSize={13}
                  fontWeight={600}
                  fill="var(--fg)"
                  fontFamily="var(--font-display)"
                >
                  {name}
                </text>
                <text
                  x={0}
                  y={(y0 + y1) / 2 + 12}
                  fontSize={11}
                  fill="var(--faint)"
                  fontFamily="var(--font-mono)"
                >
                  {size}
                </text>
                <line
                  x1={MODEL_W - 10}
                  x2={MODEL_W - 10}
                  y1={y0 + 2}
                  y2={y1 - 2}
                  stroke="var(--line-strong)"
                />
              </g>
            )
          })}

          {agents.map((agent, r) => (
            <g key={agent.id} role="row">
              <text
                role="rowheader"
                aria-label={`${agent.modelLabel}, ${DESIGN_LABEL[agent.agentDesign]}`}
                x={MODEL_W}
                y={rowY(r) + CELL_H / 2 + 4}
                fontSize={12.5}
                fill="var(--muted)"
                fontFamily="var(--font-sans)"
              >
                {DESIGN_LABEL[agent.agentDesign]}
              </text>
              {faultKeys.map((key, c) => {
                const cell = cellAt(r, c)
                const p = cell ? metric.value(cell) : null
                const x = colX(c)
                const y = rowY(r)
                const isActive = active[0] === r && active[1] === c
                const where = `${agent.modelLabel}, ${DESIGN_LABEL[agent.agentDesign]}, ${faultLabel(key)}`
                // Starts with the visible text ("81% ±8" or "ref."), so voice-control users can say what they see (WCAG 2.5.3).
                const reach = exposureText(cell)
                const label = p
                  ? `${pct(p.rate)} ±${Math.round(((p.upper - p.lower) / 2) * 100)}: ${metric.label} for ${where}. 95% CI ${ciRange(p)}, n=${p.n}.${reach ? ` ${reach}` : ''} Press Enter to open these runs.`
                  : `ref.: ${where}, no ${metric.label.toLowerCase()} value (reference column). Press Enter to open these runs.`
                const t = p
                  ? Math.max(
                      0,
                      Math.min(
                        1,
                        (p.rate - metric.domain[0]) / (metric.domain[1] - metric.domain[0]),
                      ),
                    )
                  : 0
                const ink = t > inkSwitch ? 'var(--heat-ink)' : 'var(--fg)'
                return (
                  <g
                    key={key}
                    ref={(el) => {
                      if (el) cellRefs.current.set(`${r}:${c}`, el)
                      else cellRefs.current.delete(`${r}:${c}`)
                    }}
                    role="gridcell"
                    tabIndex={isActive ? 0 : -1}
                    aria-label={label}
                    className="group cursor-pointer outline-none"
                    onClick={() => onOpen(agent.id, key)}
                    onKeyDown={(e) => onKeyDown(e, r, c)}
                    onFocus={(e) => {
                      setActive([r, c])
                      tipFromElement(r, c, e.currentTarget)
                    }}
                    onBlur={() => setTip(null)}
                    onMouseMove={(e) => tipFromMouse(r, c, e)}
                    onMouseLeave={() => setTip(null)}
                  >
                    {p ? (
                      <>
                        <rect
                          x={x}
                          y={y}
                          width={CELL_W}
                          height={CELL_H}
                          rx={3}
                          style={{
                            fill: `color-mix(in oklab, ${metric.color} ${Math.round(t * 100)}%, var(--heat-lo))`,
                          }}
                          className="stroke-transparent stroke-2 group-hover:stroke-fg group-focus-visible:stroke-fg"
                        />
                        <text
                          x={x + CELL_W / 2}
                          y={y + 19}
                          textAnchor="middle"
                          fontSize={14}
                          fontWeight={600}
                          fill={ink}
                          fontFamily="var(--font-sans)"
                          className="tabular-nums"
                        >
                          {pct(p.rate)}
                        </text>
                        <text
                          x={x + CELL_W / 2}
                          y={y + 33}
                          textAnchor="middle"
                          fontSize={10}
                          fill={ink}
                          opacity={0.8}
                          fontFamily="var(--font-mono)"
                        >
                          ±{Math.round(((p.upper - p.lower) / 2) * 100)}
                        </text>
                      </>
                    ) : (
                      <>
                        <rect
                          x={x}
                          y={y}
                          width={CELL_W}
                          height={CELL_H}
                          rx={3}
                          fill="var(--raised)"
                          stroke="var(--line)"
                          strokeDasharray="3 3"
                          className="group-hover:stroke-fg group-focus-visible:stroke-fg"
                        />
                        <text
                          x={x + CELL_W / 2}
                          y={y + CELL_H / 2 + 4}
                          textAnchor="middle"
                          fontSize={11}
                          fill="var(--faint)"
                          fontFamily="var(--font-mono)"
                        >
                          ref.
                        </text>
                      </>
                    )}
                  </g>
                )
              })}
            </g>
          ))}
        </svg>
      </div>

      {tip && tipCell && (
        <div
          role="presentation"
          className="pointer-events-none absolute z-10 flex flex-col gap-1 rounded-md border border-line-strong bg-raised px-3 py-2.5 text-[13px] shadow-lg"
          style={{ left: tip.x, top: tip.y, width: TIP_W }}
        >
          <span className="font-medium">
            {agents[tip.r]!.modelLabel} · {DESIGN_LABEL[agents[tip.r]!.agentDesign]}
          </span>
          <span className="text-muted">{faultLabel(faultKeys[tip.c]!)}</span>
          {tipValue ? (
            <span>
              {metric.label}: <b className="font-semibold tabular-nums">{pct(tipValue.rate)}</b>{' '}
              <span className="font-mono text-xs text-faint">
                95% CI {ciRange(tipValue)} · n={tipValue.n}
              </span>
            </span>
          ) : (
            <span className="text-faint">
              The baseline is the reference for recovery, so it has no value.
            </span>
          )}
          <span className="text-xs text-faint">
            {tipCell.counts.success} success · {tipCell.counts.failure} failure ·{' '}
            {tipCell.counts.unsafe} unsafe
          </span>
          {exposureText(tipCell) && (
            <span className="text-xs text-faint">{exposureText(tipCell)}</span>
          )}
          <span className="text-xs text-faint">Click or press Enter to open these runs</span>
        </div>
      )}
    </div>
  )
}
