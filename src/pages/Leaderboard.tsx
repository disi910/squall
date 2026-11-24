import { use } from 'react'
import { useSearchParams } from 'react-router'
import { Rate } from '../components/Rate.tsx'
import { useScrollFade } from '../components/scroll.ts'
import { BUILD_DATA } from '../content/banner.ts'
import { copyFor } from '../content/copy.ts'
import type { LeaderboardRow } from '../data/analysis.ts'
import { fmtInt } from '../data/format.ts'
import { DESIGN_LABEL, faultLabel } from '../data/labels.ts'
import { loadAnalysis } from '../data/load.ts'
import { PageTitle } from './PageTitle.tsx'

/** The golden-traces sentence only applies to data that has golden traces. */
const GOLDEN_NOTE = copyFor(BUILD_DATA.source).goldenNote

type SortKey =
  'baseline' | 'underFaults' | 'safety' | 'injection' | 'escalation' | 'tokensPerSuccess'

interface Column {
  key: SortKey
  label: (scope: string) => string
  help: string
  /** Lower is better: the first click sorts ascending. */
  lowerIsBetter?: boolean
}

const COLUMNS: Column[] = [
  { key: 'baseline', label: () => 'Baseline success', help: 'Success with no faults injected.' },
  {
    key: 'underFaults',
    label: (s) =>
      s === 'all' ? 'Success under faults' : `Success: ${faultLabel(s).toLowerCase()}`,
    help: 'Pooled over every run in the selected fault setting. With equal runs per fault, this equals the mean of the per-fault rates.',
  },
  {
    key: 'safety',
    label: () => 'Safety violations',
    help: 'Runs where any safety grader failed: unauthorized or incorrect side effects. Lower is better.',
    lowerIsBetter: true,
  },
  {
    key: 'injection',
    label: () => 'Injection compliance',
    help: 'Share of prompt-injection runs where the agent followed the injected instruction. Lower is better.',
    lowerIsBetter: true,
  },
  {
    key: 'escalation',
    label: () => 'Escalation correct',
    help: 'Escalated exactly when the task called for it.',
  },
  {
    key: 'tokensPerSuccess',
    label: () => 'Tokens / success',
    help: 'Total tokens divided by successful runs, in the selected fault setting. Lower is better.',
    lowerIsBetter: true,
  },
]
const isSortKey = (s: string | null): s is SortKey => COLUMNS.some((c) => c.key === s)

const sortValue = (row: LeaderboardRow, key: SortKey): number | null =>
  key === 'tokensPerSuccess' ? row.tokensPerSuccess : (row[key]?.rate ?? null)

export function Leaderboard() {
  const analysis = use(loadAnalysis())
  const tableRef = useScrollFade<HTMLDivElement>()
  const [params, setParams] = useSearchParams()

  // URL state, validated: an unknown value falls back to the default instead of breaking the page.
  const scopeParam = params.get('fault') ?? 'all'
  const scope = scopeParam in analysis.leaderboard ? scopeParam : 'all'
  const sortParam = params.get('sort')
  const sort: SortKey = isSortKey(sortParam) ? sortParam : 'underFaults'
  const column = COLUMNS.find((c) => c.key === sort)!
  const dirParam = params.get('dir')
  const dir =
    dirParam === 'asc' || dirParam === 'desc' ? dirParam : column.lowerIsBetter ? 'asc' : 'desc'

  const update = (next: Record<string, string>) =>
    setParams(
      (p) => {
        for (const [k, v] of Object.entries(next)) p.set(k, v)
        return p
      },
      { replace: true, preventScrollReset: true },
    )

  const onSort = (key: SortKey) => {
    const col = COLUMNS.find((c) => c.key === key)!
    if (key === sort) update({ sort: key, dir: dir === 'asc' ? 'desc' : 'asc' })
    else update({ sort: key, dir: col.lowerIsBetter ? 'asc' : 'desc' })
  }

  const rows = [...(analysis.leaderboard[scope] ?? [])].sort((a, b) => {
    const va = sortValue(a, sort)
    const vb = sortValue(b, sort)
    if (va === null) return vb === null ? 0 : 1 // missing values always last
    if (vb === null) return -1
    return dir === 'asc' ? va - vb : vb - va
  })
  const scopes = Object.keys(analysis.leaderboard).filter((s) => s !== 'all')

  return (
    <div className="flex flex-col gap-7">
      <PageTitle title="Leaderboard" />
      <div className="flex max-w-[760px] flex-col gap-2">
        <span className="eyebrow">Leaderboard</span>
        <h1 className="text-3xl">Agent configurations</h1>
        <p className="text-muted">
          {copyFor(BUILD_DATA.source).leaderboardIntro(analysis.agents.length)} Every rate is a
          share of runs with its 95% Wilson interval. Click a column to sort.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="lb-fault" className="font-mono text-xs tracking-wide text-faint">
          Fault setting for the success, safety and cost columns
        </label>
        <select
          id="lb-fault"
          value={scope}
          onChange={(e) => update({ fault: e.target.value })}
          className="w-fit max-w-full rounded-md border border-line-strong bg-surface py-1.5 pr-8 pl-2.5 text-sm"
        >
          <option value="all">All faults (pooled)</option>
          {scopes.map((s) => (
            <option key={s} value={s}>
              {faultLabel(s)}
            </option>
          ))}
        </select>
      </div>

      <div ref={tableRef} className="card overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Agent configurations sorted by {column.label(scope).toLowerCase()},{' '}
            {dir === 'asc' ? 'ascending' : 'descending'}
          </caption>
          <thead>
            <tr className="bg-raised">
              <th
                scope="col"
                className="w-8 border-b border-line px-3.5 py-2.5 text-left font-mono text-xs font-medium text-faint"
              >
                #
              </th>
              <th
                scope="col"
                className="border-b border-line px-3.5 py-2.5 text-left text-[12.5px] font-medium text-muted"
              >
                Agent
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  title={c.help}
                  className="border-b border-line px-3.5 py-2.5 text-left text-[12.5px] font-medium whitespace-nowrap text-muted"
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className={`inline-flex cursor-pointer items-center gap-1 ${sort === c.key ? 'text-fg' : ''}`}
                  >
                    {c.label(scope)}
                    <span aria-hidden="true" className="w-2.5 text-[10px]">
                      {sort === c.key ? (dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.agent.id} className="hover:bg-surface-2">
                <td className="border-b border-line px-3.5 py-2.5 font-mono text-faint">{i + 1}</td>
                <th
                  scope="row"
                  className="border-b border-line px-3.5 py-2.5 text-left font-normal"
                >
                  <span className="flex min-w-[170px] flex-col">
                    <span className="font-medium">{r.agent.modelLabel}</span>
                    <span className="text-[12.5px] text-faint">
                      {DESIGN_LABEL[r.agent.agentDesign]}
                    </span>
                  </span>
                </th>
                <td className="border-b border-line px-3.5 py-2.5">
                  <Rate p={r.baseline} />
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <Rate p={r.underFaults} />
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <Rate p={r.safety} />
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <Rate p={r.injection} />
                </td>
                <td className="border-b border-line px-3.5 py-2.5">
                  <Rate p={r.escalation} />
                </td>
                <td className="border-b border-line px-3.5 py-2.5 tabular-nums">
                  {fmtInt(r.tokensPerSuccess)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="max-w-[80ch] text-[13px] text-faint">
        Injection compliance always uses the prompt-injection runs, and escalation correctness
        always uses every run, whatever the filter. With “All faults”, safety violations count every
        run, baseline included.
        {GOLDEN_NOTE && ` ${GOLDEN_NOTE}`}
      </p>
    </div>
  )
}
