import { use } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Heatmap } from '../components/Heatmap.tsx'
import type { HeatmapMetric } from '../components/Heatmap.tsx'
import { loadAnalysis } from '../data/load.ts'
import { PageTitle } from './PageTitle.tsx'

/**
 * Fixed color domains per metric, so the legend means the same thing every
 * visit. Success and recovery start at 30%: below that the differences
 * matter less than the spread between 60% and 95%, which is where the
 * agents actually differ.
 */
const METRICS: HeatmapMetric[] = [
  {
    id: 'success',
    label: 'Success',
    legend: 'Success rate',
    color: 'var(--heat-hi)',
    domain: [0.3, 1],
    value: (c) => c.success,
  },
  {
    id: 'safety',
    label: 'Safety violations',
    legend: 'Safety violation rate',
    color: 'var(--heat-bad)',
    domain: [0, 0.6],
    value: (c) => c.safety,
  },
  {
    id: 'recovery',
    label: 'Recovery',
    legend: 'Recovery rate (paired)',
    color: 'var(--heat-hi)',
    domain: [0.3, 1],
    value: (c) => c.recovery,
  },
]

export function Matrix() {
  const analysis = use(loadAnalysis())
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const metric = METRICS.find((m) => m.id === params.get('metric')) ?? METRICS[0]!
  const [lo, hi] = metric.domain.map((d) => Math.round(d * 100))
  const cellN =
    analysis.matrix[analysis.agents[0]?.id ?? '']?.[analysis.faultKeys[0] ?? '']?.success?.n

  return (
    <div className="flex flex-col gap-7">
      <PageTitle title="Robustness matrix" />
      <div className="flex max-w-[760px] flex-col gap-2">
        <span className="eyebrow">Robustness matrix</span>
        <h1 className="text-3xl">Where each agent breaks</h1>
        <p className="text-muted">
          Rows are agent configs, columns are fault settings
          {cellN ? `, and each cell pools ${cellN} runs` : ''}. Hover or focus a cell for its
          interval; click it, or press Enter, to open those runs.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="group"
          aria-label="Metric"
          className="inline-flex overflow-hidden rounded-md border border-line-strong"
        >
          {METRICS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === metric.id}
              onClick={() =>
                setParams((p) => (p.set('metric', m.id), p), {
                  replace: true,
                  preventScrollReset: true,
                })
              }
              className={`cursor-pointer border-line-strong px-3.5 py-1.5 text-sm not-first:border-l ${
                m.id === metric.id
                  ? 'bg-surface-2 text-fg shadow-[inset_0_-2px_0_var(--fg)]'
                  : 'bg-surface text-muted hover:text-fg'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs text-muted">
          <span>{metric.id === 'safety' ? `${lo}%` : `≤${lo}%`}</span>
          <span
            aria-hidden="true"
            className="h-2.5 w-44 rounded-sm border border-line"
            style={{ background: `linear-gradient(90deg, var(--heat-lo), ${metric.color})` }}
          />
          <span>{metric.id === 'safety' ? `≥${hi}%` : `${hi}%`}</span>
          <span className="text-faint">{metric.legend} · ± = half-width of the 95% CI</span>
        </div>
      </div>

      <div className="card p-4">
        <Heatmap
          analysis={analysis}
          metric={metric}
          onOpen={(agent, fault) => navigate(`/runs?${new URLSearchParams({ agent, fault })}`)}
        />
      </div>

      <dl className="grid gap-4 text-[13.5px] text-muted md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="font-medium text-fg">Success</dt>
          <dd>Share of runs where every grader passed. The baseline column is the sunny day.</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-medium text-fg">Safety violations</dt>
          <dd>
            Share of runs where any safety grader failed: an unauthorized refund, data shared with
            the wrong person, or an action policy reserves for humans.
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-medium text-fg">Recovery (paired)</dt>
          <dd>
            Of the tasks an agent solved in every baseline run, the share of runs it still solved
            with the fault on. The baseline column is the reference, so it has no value.
          </dd>
        </div>
      </dl>
    </div>
  )
}
