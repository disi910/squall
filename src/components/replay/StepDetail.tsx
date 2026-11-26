import type { GraderResult, Step } from '../../schema/index.ts'

const json = (v: unknown) => JSON.stringify(v, null, 2) ?? String(v)
const short = (v: unknown) =>
  v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** A JSON block, with an optional excerpt (e.g. an injected instruction) highlighted wherever it appears. */
function Code({ text, highlight }: { text: string; highlight?: string }) {
  const parts = highlight ? text.split(highlight) : [text]
  return (
    <pre className="m-0 overflow-x-auto rounded-md border border-line bg-bg p-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <mark className="rounded-sm bg-fault-soft text-fault outline outline-1 outline-fault">
              {highlight}
            </mark>
          )}
        </span>
      ))}
    </pre>
  )
}

/** The left panel: what happened at the current step, rendered by step type. */
export function StepDetail({ step, failures }: { step: Step; failures: GraderResult[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {step.type === 'observation' && (
        <>
          <p className="text-[12.5px] text-faint">
            {step.index === 0
              ? 'Instructions the harness gives the agent at the start of the run.'
              : 'A prompt from the agent design itself, such as a plan, step or verification prompt.'}
          </p>
          <p className="leading-relaxed whitespace-pre-wrap">{step.content}</p>
        </>
      )}
      {step.type === 'reasoning' && (
        <p className="border-l-2 border-step-reasoning pl-3 leading-relaxed whitespace-pre-wrap">
          {step.content}
        </p>
      )}
      {step.type === 'final_answer' && (
        <p className="leading-relaxed whitespace-pre-wrap">{step.content}</p>
      )}

      {step.type === 'tool_call' && (
        <>
          <p className="font-mono text-sm">
            {step.tool}
            <span className="text-faint">(…)</span>{' '}
            <span className="text-xs text-faint">call {step.callId}</span>
          </p>
          <Code text={json(step.args)} />
        </>
      )}

      {step.type === 'tool_result' && (
        <>
          {step.injectedFault && (
            <div className="flex flex-col gap-1 rounded-md border border-fault bg-fault-soft px-3 py-2.5 text-[13.5px]">
              <span className="eyebrow text-fault">▼ Fault injected · {step.injectedFault.id}</span>
              <span>{step.injectedFault.note}</span>
              <span className="text-xs text-faint">
                The agent does not see this note. It only sees the response below.
              </span>
            </div>
          )}
          <p className="font-mono text-xs text-faint">
            result of {step.callId} · {step.ok ? 'ok' : 'error'}
          </p>
          {!step.ok && step.error ? (
            <p className="rounded-md border border-unsafe bg-unsafe-soft px-3 py-2 font-mono text-[12.5px]">
              {step.error.kind}: {step.error.message}
            </p>
          ) : typeof step.result === 'string' ? (
            <>
              <p className="font-mono text-xs text-unsafe">Not valid JSON: the body is cut off.</p>
              <Code text={step.result} />
            </>
          ) : (
            <Code text={json(step.result)} highlight={step.injectedFault?.excerpt} />
          )}
        </>
      )}

      {failures.map((g) => (
        <p
          key={g.graderId}
          className={`rounded-md border px-3 py-2 font-mono text-[12.5px] ${
            g.severity === 'safety' ? 'border-unsafe bg-unsafe-soft' : 'border-fail bg-fail-soft'
          }`}
        >
          ✕ {g.graderId} fails here: {g.detail}
        </p>
      ))}

      <div className="flex flex-col gap-1.5">
        <span className="eyebrow">World changes at this step</span>
        {step.type === 'tool_result' && step.worldDiff?.length ? (
          step.worldDiff.map((d) => (
            <p key={d.path} className="flex flex-wrap items-baseline gap-1.5 font-mono text-xs">
              <span className="text-muted">{d.path}</span>
              {d.before === null ? (
                <span className="text-faint">(new)</span>
              ) : (
                <del className="text-unsafe">{short(d.before)}</del>
              )}
              <span className="text-faint">→</span>
              <ins className="text-ok no-underline">{short(d.after)}</ins>
            </p>
          ))
        ) : (
          <p className="text-[13px] text-faint italic">
            {step.type === 'tool_result' && step.injectedFault?.id === 'silent_failure'
              ? 'None, even though the tool reported success.'
              : 'None.'}
          </p>
        )}
      </div>
    </div>
  )
}
