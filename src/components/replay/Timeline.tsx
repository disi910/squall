import { STEP_LABEL } from '../../data/labels.ts'
import type { GraderResult, Step } from '../../schema/index.ts'
import { STEP_BG } from '../stepColors.ts'

interface TimelineProps {
  steps: Step[]
  current: number
  failures: Map<number, GraderResult[]>
  onSelect: (step: number) => void
}

/**
 * The scrubber: one column per step, colored by type. Above it, amber
 * triangles mark where the fault layer altered a result; below it, ✕ marks
 * where a grader says things went wrong. Each column is a button, so the
 * timeline works with a mouse, a finger or the keyboard.
 */
export function Timeline({ steps, current, failures, onSelect }: TimelineProps) {
  return (
    <div className="overflow-x-auto pb-1">
      <div
        role="group"
        aria-label={`Timeline, ${steps.length} steps`}
        className="grid min-w-full auto-cols-[minmax(24px,1fr)] grid-flow-col gap-[3px]"
        // At least 24 px per step (WCAG 2.5.8 target size); the timeline scrolls sideways if it does not fit.
        style={{ minWidth: steps.length * 27 }}
      >
        {steps.map((s, i) => {
          const fault = s.type === 'tool_result' ? s.injectedFault : undefined
          const failed = failures.get(i)
          const label = [
            `Step ${i}: ${STEP_LABEL[s.type]}`,
            'tool' in s ? s.tool : null,
            fault ? `fault injected (${fault.id})` : null,
            failed ? `grader failed (${failed.map((g) => g.graderId).join(', ')})` : null,
          ]
            .filter(Boolean)
            .join(', ')
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={label}
              aria-current={i === current ? 'step' : undefined}
              title={label}
              className="group grid cursor-pointer grid-rows-[12px_26px_14px_14px] justify-items-center gap-[3px]"
            >
              <span aria-hidden="true" className="self-end">
                {fault && (
                  <svg width="12" height="10" viewBox="0 0 12 10">
                    <path d="M0 0h12L6 10z" fill="var(--fault)" />
                  </svg>
                )}
              </span>
              <span
                aria-hidden="true"
                className={`w-full rounded-sm transition-opacity ${STEP_BG[s.type]} ${
                  i === current
                    ? 'opacity-100 shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--fg)]'
                    : i < current
                      ? 'opacity-85 group-hover:opacity-100'
                      : 'opacity-45 group-hover:opacity-85'
                }`}
              />
              <span aria-hidden="true" className="text-xs leading-[14px] font-semibold text-unsafe">
                {failed ? '✕' : ''}
              </span>
              <span aria-hidden="true" className="font-mono text-[10px] leading-[14px] text-faint">
                {i % 5 === 0 || (i === steps.length - 1 && i % 5 >= 3) ? i : ''}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TimelineLegend() {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted">
      {(Object.keys(STEP_BG) as Step['type'][]).map((t) => (
        <span key={t} className="inline-flex items-center gap-1.5">
          <i className={`inline-block h-2 w-3 rounded-sm ${STEP_BG[t]}`} />
          {STEP_LABEL[t]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <svg width="10" height="8" viewBox="0 0 12 10" aria-hidden="true">
          <path d="M0 0h12L6 10z" fill="var(--fault)" />
        </svg>
        Fault injected
      </span>
      <span className="inline-flex items-center gap-1.5">
        <b className="font-semibold text-unsafe">✕</b> Grader failed here
      </span>
    </div>
  )
}
