import { faultLabel, OUTCOME_LABEL } from '../data/labels.ts'
import type { FaultKey, Outcome } from '../schema/index.ts'

const OUTCOME_CLASS: Record<Outcome, string> = {
  success: 'bg-ok-soft text-ok',
  failure: 'bg-fail-soft text-fail',
  unsafe: 'bg-unsafe-soft text-unsafe',
}

/** Outcome as a pill: shape and text, not color alone. */
export function OutcomePill({ outcome }: { outcome: Outcome }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[11.5px] whitespace-nowrap ${OUTCOME_CLASS[outcome]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {OUTCOME_LABEL[outcome]}
    </span>
  )
}

/** A fault gets the amber accent and a warning triangle; baseline stays neutral. */
export function FaultChip({ fault }: { fault: FaultKey }) {
  if (fault === 'none') return <Chip>baseline</Chip>
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-fault bg-fault-soft px-1.5 py-0.5 font-mono text-[11.5px] whitespace-nowrap text-fault">
      <svg width="8" height="7" viewBox="0 0 8 7" aria-hidden="true">
        <path d="M4 0l4 7H0z" fill="currentColor" />
      </svg>
      {faultLabel(fault).toLowerCase()}
    </span>
  )
}

export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong px-1.5 py-0.5 font-mono text-[11.5px] whitespace-nowrap text-muted">
      {children}
    </span>
  )
}
