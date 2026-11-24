import { Suspense, use, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { FaultChip, OutcomePill } from '../components/Badges.tsx'
import { ReplayCard } from '../components/ReplayCard.tsx'
import { useScrollFade } from '../components/scroll.ts'
import { Skeleton } from '../components/Skeleton.tsx'
import { VirtualRows } from '../components/VirtualRows.tsx'
import { BUILD_DATA } from '../content/banner.ts'
import { copyFor } from '../content/copy.ts'
import { ciRange, fmtCompact, pct } from '../data/format.ts'
import { agentName, DESIGN_LABEL, faultLabel } from '../data/labels.ts'
import { loadManifest, loadRunIndex } from '../data/load.ts'
import type { RunRow } from '../data/requests.ts'
import { wilson } from '../metrics/index.ts'
import { faultKey } from '../schema/helpers.ts'
import { PageTitle } from './PageTitle.tsx'

const ROW_H = 44
const VIEW_H = 560
const COLS =
  'grid grid-cols-[minmax(170px,1.2fr)_minmax(220px,2fr)_150px_52px_96px_60px_70px_84px] items-center gap-3 px-3.5'

/** Filters in the URL, so a matrix cell or a shared link opens exactly this list. */
const FILTERS = ['agent', 'task', 'fault', 'outcome', 'seed'] as const

export function Runs() {
  const manifest = use(loadManifest())
  const rows = use(loadRunIndex())
  const [params, setParams] = useSearchParams()
  const tableRef = useScrollFade<HTMLDivElement>()
  // A filter value from the URL counts only if it is one of the options, so a stale or
  // mistyped link never filters by something the dropdowns cannot show.
  const options: Record<(typeof FILTERS)[number], Set<string>> = {
    agent: new Set(manifest.agents.map((a) => a.id)),
    task: new Set(manifest.tasks.map((t) => t.id)),
    fault: new Set(manifest.faultSettings.map((spec) => faultKey(spec))),
    outcome: new Set(['success', 'failure', 'unsafe']),
    seed: new Set(manifest.seeds.map(String)),
  }
  const filter = Object.fromEntries(
    FILTERS.map((f) => {
      const value = params.get(f) ?? ''
      return [f, options[f].has(value) ? value : '']
    }),
  ) as Record<(typeof FILTERS)[number], string>
  const onlyReplays = params.get('replay') === '1'

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!filter.agent || r.agentId === filter.agent) &&
          (!filter.task || r.taskId === filter.task) &&
          (!filter.fault || r.faultKey === filter.fault) &&
          (!filter.outcome || r.outcome === filter.outcome) &&
          (!filter.seed || String(r.seed) === filter.seed) &&
          (!onlyReplays || r.traced),
      ),
    [rows, filter.agent, filter.task, filter.fault, filter.outcome, filter.seed, onlyReplays],
  )

  const setFilter = (key: string, value: string) =>
    setParams(
      (p) => {
        if (value) p.set(key, value)
        else p.delete(key)
        return p
      },
      { replace: true, preventScrollReset: true },
    )

  const agents = new Map(manifest.agents.map((a) => [a.id, a]))
  const tasks = new Map(manifest.tasks.map((t) => [t.id, t]))
  const success = wilson(filtered.filter((r) => r.outcome === 'success').length, filtered.length)
  const unsafe = wilson(filtered.filter((r) => r.outcome === 'unsafe').length, filtered.length)
  const meanSteps = filtered.length
    ? filtered.reduce((s, r) => s + r.stepCount, 0) / filtered.length
    : null
  const selectClass =
    'max-w-full rounded-md border border-line-strong bg-surface py-1.5 pr-8 pl-2.5 text-sm'

  return (
    <div className="flex flex-col gap-7">
      <PageTitle title="Runs" />
      <div className="flex max-w-[760px] flex-col gap-2">
        <span className="eyebrow">Run explorer</span>
        <h1 className="text-3xl">Runs</h1>
        <p className="text-muted">
          {copyFor(BUILD_DATA.source).runsIntro} Runs with a replay open step by step; the others
          show their summary and grader results.
        </p>
      </div>

      {manifest.goldenRunIds.length > 0 && (
        <section className="flex flex-col gap-2.5">
          {/* A real heading (styled as a label), so the cards' h3 titles sit under an h2. */}
          <h2 className="eyebrow font-mono font-normal tracking-[0.08em]">
            Golden traces · hand-written showcases, excluded from metrics
          </h2>
          <Suspense
            fallback={
              <div className="grid gap-3 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-52" />
                ))}
              </div>
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              {manifest.goldenRunIds.map((id) => (
                <ReplayCard key={id} runId={id} />
              ))}
            </div>
          </Suspense>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect
          id="f-agent"
          label="Agent"
          value={filter.agent}
          onChange={(v) => setFilter('agent', v)}
          className={selectClass}
        >
          <option value="">All agents</option>
          {manifest.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {agentName(a)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="f-task"
          label="Task"
          value={filter.task}
          onChange={(v) => setFilter('task', v)}
          className={selectClass}
        >
          <option value="">All tasks</option>
          {manifest.tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id} {t.title}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          id="f-fault"
          label="Fault"
          value={filter.fault}
          onChange={(v) => setFilter('fault', v)}
          className={selectClass}
        >
          <option value="">All faults</option>
          {manifest.faultSettings.map((spec) => {
            const key = faultKey(spec)
            return (
              <option key={key} value={key}>
                {faultLabel(key)}
              </option>
            )
          })}
        </FilterSelect>
        <FilterSelect
          id="f-outcome"
          label="Outcome"
          value={filter.outcome}
          onChange={(v) => setFilter('outcome', v)}
          className={selectClass}
        >
          <option value="">All outcomes</option>
          <option value="success">success</option>
          <option value="failure">failure</option>
          <option value="unsafe">unsafe</option>
        </FilterSelect>
        <FilterSelect
          id="f-seed"
          label="Seed"
          value={filter.seed}
          onChange={(v) => setFilter('seed', v)}
          className={selectClass}
        >
          <option value="">All seeds</option>
          {manifest.seeds.map((s) => (
            <option key={s} value={String(s)}>
              Seed {s}
            </option>
          ))}
        </FilterSelect>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={onlyReplays}
            onChange={(e) => setFilter('replay', e.target.checked ? '1' : '')}
            className="size-4 accent-current"
          />
          Only runs with a replay
        </label>
        <button
          type="button"
          onClick={() => setParams({}, { replace: true, preventScrollReset: true })}
          className="cursor-pointer rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          Reset filters
        </button>
      </div>

      <p
        className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted"
        aria-live="polite"
      >
        {filtered.length ? (
          <>
            <span>
              <b className="font-medium text-fg tabular-nums">
                {filtered.length.toLocaleString('en-US')}
              </b>{' '}
              runs
            </span>
            <span>
              Success <b className="font-medium text-fg tabular-nums">{pct(success?.rate)}</b>{' '}
              <span className="font-mono text-xs text-faint">[{ciRange(success)}]</span>
            </span>
            <span>
              Unsafe <b className="font-medium text-fg tabular-nums">{pct(unsafe?.rate)}</b>{' '}
              <span className="font-mono text-xs text-faint">[{ciRange(unsafe)}]</span>
            </span>
            <span>
              Mean steps <b className="font-medium text-fg tabular-nums">{meanSteps?.toFixed(1)}</b>
            </span>
          </>
        ) : (
          <span>No runs match these filters.</span>
        )}
      </p>

      <div ref={tableRef} className="card overflow-x-auto">
        <div
          role="table"
          aria-label="Runs"
          aria-rowcount={filtered.length + 1}
          className="min-w-[940px]"
        >
          <div role="rowgroup">
            <div
              role="row"
              aria-rowindex={1}
              className={`${COLS} h-10 border-b border-line bg-raised text-[12.5px] font-medium text-muted`}
            >
              {['Agent', 'Task', 'Fault', 'Seed', 'Outcome', 'Steps', 'Tokens', 'Trace'].map(
                (h) => (
                  <span
                    key={h}
                    role="columnheader"
                    className={['Seed', 'Steps', 'Tokens'].includes(h) ? 'text-right' : ''}
                  >
                    {h}
                  </span>
                ),
              )}
            </div>
          </div>
          {filtered.length ? (
            <VirtualRows
              // A new key per filter resets the scroll position to the top.
              key={[...FILTERS.map((f) => filter[f]), onlyReplays].join('|')}
              items={filtered}
              rowHeight={ROW_H}
              viewportHeight={VIEW_H}
              renderRow={(r: RunRow, i, style) => {
                const agent = agents.get(r.agentId)
                const task = tasks.get(r.taskId)
                return (
                  <div
                    key={r.id}
                    role="row"
                    aria-rowindex={i + 2}
                    style={style}
                    className={`${COLS} border-b border-line text-[13.5px] hover:bg-surface-2`}
                  >
                    <span role="cell" className="truncate">
                      {agent
                        ? `${agent.modelLabel.replace(/ \(.*\)$/, '')} · ${DESIGN_LABEL[agent.agentDesign]}`
                        : r.agentId}
                    </span>
                    <span role="cell" className="truncate">
                      {/* Stretched link: the whole row is clickable, but there is one link per row for screen readers. */}
                      <Link
                        to={`/runs/${encodeURIComponent(r.id)}`}
                        className="text-fg no-underline after:absolute after:inset-0 hover:underline"
                      >
                        <span className="font-mono text-faint">{r.taskId}</span> {task?.title ?? ''}
                      </Link>
                    </span>
                    <span role="cell">
                      <FaultChip fault={r.faultKey} />
                    </span>
                    <span role="cell" className="text-right tabular-nums">
                      {r.seed}
                    </span>
                    <span role="cell">
                      <OutcomePill outcome={r.outcome} />
                    </span>
                    <span role="cell" className="text-right tabular-nums">
                      {r.stepCount}
                    </span>
                    <span role="cell" className="text-right tabular-nums">
                      {fmtCompact(r.totalTokens)}
                    </span>
                    <span
                      role="cell"
                      className={`font-mono text-xs ${r.traced ? 'text-fg' : 'text-faint'}`}
                    >
                      {r.traced ? '▶ replay' : 'summary'}
                    </span>
                  </div>
                )
              }}
            />
          ) : (
            <div className="px-4 py-10 text-center text-muted">
              No runs match. Try resetting the filters.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  className,
  children,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  className: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="font-mono text-xs tracking-wide text-faint">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        {children}
      </select>
    </div>
  )
}
