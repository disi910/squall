import type {
  InjectedFault,
  Step,
  ToolError,
  ToolName,
  WorldChange,
} from '../../src/schema/index.ts'

/**
 * Appends steps with consistent indices, timestamps, call ids and token counts,
 * so the generator only has to describe what happens. Token counts grow with
 * the context, as they would in a real agent loop.
 */
export function makeTraceBuilder(rand: () => number) {
  const steps: Step[] = []
  let tMs = 0
  let context = 1100
  let callCount = 0

  const nextTime = (dt?: number) => (tMs += dt ?? Math.round(300 + rand() * 1500))
  const llmTokens = (kind: 'reasoning' | 'call' | 'final') => {
    context += 160 + Math.round(rand() * 220)
    const output =
      kind === 'reasoning' ? 80 + Math.round(rand() * 190) : 24 + Math.round(rand() * 46)
    return { input: context, output }
  }

  return {
    steps,
    observe(content: string): number {
      steps.push({ index: steps.length, tMs: nextTime(0), type: 'observation', content })
      return steps.length - 1
    },
    think(content: string): number {
      steps.push({
        index: steps.length,
        tMs: nextTime(),
        type: 'reasoning',
        content,
        tokens: llmTokens('reasoning'),
      })
      return steps.length - 1
    },
    final(content: string): number {
      steps.push({
        index: steps.length,
        tMs: nextTime(),
        type: 'final_answer',
        content,
        tokens: llmTokens('final'),
      })
      return steps.length - 1
    },
    /** Emits a tool_call and its tool_result; returns the index of the call. */
    call(
      tool: ToolName,
      args: Record<string, unknown>,
      result: unknown,
      opts: { error?: ToolError; fault?: InjectedFault; diff?: WorldChange[]; dt?: number } = {},
    ): number {
      const callId = `c${++callCount}`
      steps.push({
        index: steps.length,
        tMs: nextTime(),
        type: 'tool_call',
        callId,
        tool,
        args,
        tokens: llmTokens('call'),
      })
      const callIndex = steps.length - 1
      context += 90 + Math.round(rand() * 260)
      steps.push({
        index: steps.length,
        tMs: nextTime(opts.dt ?? Math.round(120 + rand() * 600)),
        type: 'tool_result',
        callId,
        tool,
        ok: !opts.error,
        ...(opts.error ? { error: opts.error } : { result }),
        ...(opts.fault ? { injectedFault: opts.fault } : {}),
        ...(opts.diff?.length ? { worldDiff: opts.diff } : {}),
      })
      return callIndex
    },
  }
}

export type TraceBuilder = ReturnType<typeof makeTraceBuilder>
