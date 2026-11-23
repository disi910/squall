import { z } from 'zod'
import { AgentConfig } from './agent.ts'
import { FaultSpec } from './faults.ts'
import { deriveOutcome, GraderResult, INJECTION_GRADER_ID, Outcome } from './grader.ts'
import { Step } from './step.ts'
import { WRITE_TOOLS } from './tools.ts'
import { getAtPointer, jsonEqual, setAtPointer, WorldState } from './world.ts'

/**
 * Bump the minor version for additive changes and the major version for
 * breaking ones. Every top-level document carries it so a reader can refuse
 * data it does not understand.
 */
export const SCHEMA_VERSION = '0.1.0'

/** Fields shared by the full run and its summary. */
const runFields = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1),
  agent: AgentConfig,
  taskId: z.string().min(1),
  faults: z.array(FaultSpec).describe('Injected faults. Empty array = baseline run.'),
  seed: z.int().nonnegative().describe('Seeds world variation and fault timing.'),
  outcome: Outcome,
  graders: z.array(GraderResult).min(1),
  totalTokens: z.int().nonnegative().describe('Sum of tokens over all steps.'),
  durationMs: z.int().nonnegative(),
  escalated: z.boolean().describe('Whether the agent successfully escalated the ticket.'),
  escalationExpected: z
    .boolean()
    .describe('Whether a correct agent would escalate in this run. Decided by the harness per task and faults.'),
}

type Ctx = z.RefinementCtx
type RunLike = {
  faults: FaultSpec[]
  outcome: Outcome
  graders: GraderResult[]
}

/** Checks that apply to both a full run and a summary. */
function checkCommon(run: RunLike, ctx: Ctx): void {
  const expected = deriveOutcome(run.graders)
  if (run.outcome !== expected)
    ctx.addIssue({ code: 'custom', path: ['outcome'], message: `outcome is "${run.outcome}" but the graders imply "${expected}"` })

  const faultIds = run.faults.map((f) => f.id)
  if (new Set(faultIds).size !== faultIds.length)
    ctx.addIssue({ code: 'custom', path: ['faults'], message: 'each fault id may appear only once' })

  const graderIds = run.graders.map((g) => g.graderId)
  if (new Set(graderIds).size !== graderIds.length)
    ctx.addIssue({ code: 'custom', path: ['graders'], message: 'grader ids must be unique' })

  run.graders.forEach((g, i) => {
    if (g.passed && g.failedAtStep !== undefined)
      ctx.addIssue({ code: 'custom', path: ['graders', i, 'failedAtStep'], message: 'failedAtStep is only allowed on failed graders' })
  })

  if (faultIds.includes('prompt_injection') && !graderIds.includes(INJECTION_GRADER_ID))
    ctx.addIssue({ code: 'custom', path: ['graders'], message: `runs with prompt_injection must report the "${INJECTION_GRADER_ID}" grader` })
}

/** Checks that need the steps: ordering, call pairing, tokens, and replaying the world diffs. */
function checkTrace(run: z.infer<typeof RunShape>, ctx: Ctx): void {
  const { steps } = run
  const calls = new Map<string, { tool: string; answered: boolean }>()
  let tokenSum = 0
  let escalatedInTrace = false
  // Replaying every diff from initialWorld proves the trace is self-consistent:
  // the replay viewer will show exactly the states the harness saw.
  const world = structuredClone(run.initialWorld) as Record<string, unknown>
  const faultIds = new Set(run.faults.map((f) => f.id))

  steps.forEach((step, i) => {
    const at = (...p: (string | number)[]) => ['steps', i, ...p]
    if (step.index !== i) ctx.addIssue({ code: 'custom', path: at('index'), message: `index is ${step.index}, expected ${i}` })
    const prev = steps[i - 1]
    if (prev && step.tMs < prev.tMs) ctx.addIssue({ code: 'custom', path: at('tMs'), message: 'tMs must not decrease' })
    if ('tokens' in step && step.tokens) tokenSum += step.tokens.input + step.tokens.output

    if (step.type === 'tool_call') {
      if (calls.has(step.callId)) ctx.addIssue({ code: 'custom', path: at('callId'), message: `duplicate callId "${step.callId}"` })
      calls.set(step.callId, { tool: step.tool, answered: false })
    }

    if (step.type === 'tool_result') {
      const call = calls.get(step.callId)
      if (!call) ctx.addIssue({ code: 'custom', path: at('callId'), message: `no earlier tool_call with callId "${step.callId}"` })
      else {
        if (call.answered) ctx.addIssue({ code: 'custom', path: at('callId'), message: `callId "${step.callId}" already has a result` })
        if (call.tool !== step.tool) ctx.addIssue({ code: 'custom', path: at('tool'), message: `result tool "${step.tool}" does not match call tool "${call.tool}"` })
        call.answered = true
      }
      if (step.ok && step.error) ctx.addIssue({ code: 'custom', path: at('error'), message: 'error must be absent when ok is true' })
      if (!step.ok && !step.error) ctx.addIssue({ code: 'custom', path: at('error'), message: 'error is required when ok is false' })
      if (step.injectedFault && !faultIds.has(step.injectedFault.id))
        ctx.addIssue({ code: 'custom', path: at('injectedFault', 'id'), message: `fault "${step.injectedFault.id}" is not in the run's faults` })
      if (step.worldDiff?.length && !WRITE_TOOLS.has(step.tool))
        ctx.addIssue({ code: 'custom', path: at('worldDiff'), message: `${step.tool} is read-only and cannot change the world` })
      if (step.ok && step.tool === 'ticket.escalate' && step.worldDiff?.length) escalatedInTrace = true

      step.worldDiff?.forEach((change, j) => {
        const actual = getAtPointer(world, change.path)
        if (!jsonEqual(actual, change.before ?? null))
          ctx.addIssue({ code: 'custom', path: at('worldDiff', j, 'before'), message: `before does not match the replayed world at ${change.path}` })
        setAtPointer(world, change.path, change.after ?? null)
      })
    }
  })

  if (run.totalTokens !== tokenSum)
    ctx.addIssue({ code: 'custom', path: ['totalTokens'], message: `totalTokens is ${run.totalTokens}, steps sum to ${tokenSum}` })
  const last = steps[steps.length - 1]
  if (last && run.durationMs < last.tMs)
    ctx.addIssue({ code: 'custom', path: ['durationMs'], message: 'durationMs is shorter than the last step' })
  if (run.escalated !== escalatedInTrace)
    ctx.addIssue({ code: 'custom', path: ['escalated'], message: `escalated is ${run.escalated} but the trace says ${escalatedInTrace}` })
  run.graders.forEach((g, i) => {
    if (g.failedAtStep !== undefined && g.failedAtStep >= steps.length)
      ctx.addIssue({ code: 'custom', path: ['graders', i, 'failedAtStep'], message: 'failedAtStep is past the last step' })
  })
  const finalWorld = WorldState.safeParse(world)
  if (!finalWorld.success)
    ctx.addIssue({ code: 'custom', path: ['steps'], message: `applying the world diffs produces an invalid world: ${finalWorld.error.issues[0]?.message}` })
}

const RunShape = z
  .object({
    ...runFields,
    initialWorld: WorldState.describe('World state before the first step. Replay = initialWorld + diffs in order.'),
    steps: z.array(Step).min(1),
  })
  .strict()

/** A full run: the trace format the harness emits and the replay viewer reads. */
export const Run = RunShape.superRefine((run, ctx) => {
  checkCommon(run, ctx)
  checkTrace(run, ctx)
}).meta({ title: 'Run', description: 'One agent run with its full trace.' })
export type Run = z.infer<typeof Run>

/**
 * A run without `steps` and `initialWorld`. Metrics only need summaries, so the
 * UI can compute every number from one small file and fetch full traces
 * lazily. `stepCount` is the only field the steps would otherwise provide.
 */
export const RunSummary = z
  .object({ ...runFields, stepCount: z.int().positive() })
  .strict()
  .superRefine((run, ctx) => checkCommon(run, ctx))
  .meta({ title: 'RunSummary', description: 'A run without its trace; the input to all metrics.' })
export type RunSummary = z.infer<typeof RunSummary>

export function toSummary(run: Run): RunSummary {
  const { steps, initialWorld: _initialWorld, ...rest } = run
  return { ...rest, stepCount: steps.length }
}
