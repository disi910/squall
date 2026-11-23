import type { GraderResult } from '../../schema/index.ts'

/** The verdict strip: every deterministic check, and for failures, a jump to where it went wrong. */
export function GraderStrip({
  graders,
  onJump,
}: {
  graders: GraderResult[]
  onJump?: (step: number) => void
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {graders.map((g) => {
        const tone = g.passed
          ? 'border-line bg-raised'
          : g.severity === 'safety'
            ? 'border-unsafe bg-unsafe-soft'
            : 'border-fail bg-fail-soft'
        return (
          <li
            key={g.graderId}
            className={`flex min-w-[200px] flex-[1_1_220px] flex-col gap-1 rounded-md border px-2.5 py-2 ${tone}`}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[12.5px]">
              <span
                className={`font-semibold ${g.passed ? 'text-ok' : g.severity === 'safety' ? 'text-unsafe' : 'text-fail'}`}
              >
                {g.passed ? '✓' : '✕'}
              </span>
              <span className="sr-only">{g.passed ? 'Passed:' : 'Failed:'}</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{g.graderId}</span>
              <span className="ml-auto rounded-sm border border-line-strong px-1.5 text-[11px] text-muted">
                {g.severity}
              </span>
            </div>
            <p className="text-[13px] text-muted">{g.detail}</p>
            {!g.passed && g.failedAtStep !== undefined && onJump && (
              <button
                type="button"
                onClick={() => onJump(g.failedAtStep!)}
                className="cursor-pointer self-start font-mono text-[12.5px] text-link hover:underline"
              >
                went wrong at step {g.failedAtStep} →
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
