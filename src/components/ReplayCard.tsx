import { use } from 'react'
import { Link } from 'react-router'
import { FEATURED_COPY, GOLDEN_COPY } from '../content/golden.ts'
import { DESIGN_LABEL } from '../data/labels.ts'
import { loadTrace } from '../data/load.ts'
import { faultKey } from '../schema/helpers.ts'
import type { Step } from '../schema/index.ts'
import { Chip, FaultChip, OutcomePill } from './Badges.tsx'
import { STEP_BG } from './stepColors.ts'

/** A miniature of the replay timeline: one segment per step, faults in amber. */
export function StepStrip({ steps }: { steps: Step[] }) {
  return (
    <div className="flex h-2 gap-0.5" aria-hidden="true">
      {steps.map((s) => (
        <i
          key={s.index}
          className={`flex-1 rounded-[1px] ${s.type === 'tool_result' && s.injectedFault ? 'bg-fault' : STEP_BG[s.type]}`}
        />
      ))}
    </div>
  )
}

/** A card linking to a featured or golden replay. Suspends while its trace loads. */
export function ReplayCard({ runId }: { runId: string }) {
  const run = use(loadTrace(runId))
  const golden = GOLDEN_COPY[runId]
  const copy = golden ?? FEATURED_COPY[runId]
  return (
    <Link
      to={`/runs/${runId}`}
      className="card flex flex-col gap-2.5 p-4 text-fg no-underline transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <span className="eyebrow">
        {golden ? 'Golden trace' : 'Featured run'} · {run.steps.length} steps
      </span>
      <h3 className="text-base">{copy?.title ?? runId}</h3>
      {copy && <p className="text-[13.5px] text-muted">{copy.blurb}</p>}
      <StepStrip steps={run.steps} />
      <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
        <OutcomePill outcome={run.outcome} />
        <FaultChip fault={faultKey(run.faults)} />
        <Chip>
          {run.agent.modelLabel.replace(/ \(.*\)$/, '')} · {DESIGN_LABEL[run.agent.agentDesign]}
        </Chip>
      </div>
    </Link>
  )
}
