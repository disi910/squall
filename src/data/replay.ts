import { setAtPointer } from '../schema/pointer.ts'
import type { GraderResult, Run, WorldState } from '../schema/index.ts'

/**
 * Pure helpers behind the replay viewer. They only read the trace, so the
 * viewer shows exactly what the harness recorded: no reconstruction, no guessing.
 */

/** The world state after each step: initialWorld with every diff up to and including that step applied. */
export function worldStates(run: Run): WorldState[] {
  const states: WorldState[] = []
  const world = structuredClone(run.initialWorld) as unknown as Record<string, unknown>
  for (const step of run.steps) {
    if (step.type === 'tool_result')
      for (const d of step.worldDiff ?? []) setAtPointer(world, d.path, d.after ?? null)
    states.push(structuredClone(world) as unknown as WorldState)
  }
  return states
}

/** Paths changed exactly at `step`, and paths changed at any earlier step. */
export function changedPaths(run: Run, step: number): { now: Set<string>; earlier: Set<string> } {
  const now = new Set<string>()
  const earlier = new Set<string>()
  run.steps.forEach((s, i) => {
    if (i > step || s.type !== 'tool_result') return
    for (const d of s.worldDiff ?? []) (i === step ? now : earlier).add(d.path)
  })
  return { now, earlier }
}

/** Failed graders grouped by the step where they went wrong, for the timeline markers. */
export function failuresByStep(run: Run): Map<number, GraderResult[]> {
  const byStep = new Map<number, GraderResult[]>()
  for (const g of run.graders)
    if (!g.passed && g.failedAtStep !== undefined)
      byStep.set(g.failedAtStep, [...(byStep.get(g.failedAtStep) ?? []), g])
  return byStep
}

/**
 * World paths created or changed by a call that a safety grader flagged,
 * mapped to the step where the change landed. A safety grader points at the
 * tool_call; the change is recorded on that call's tool_result.
 */
export function harmfulChanges(run: Run): Map<string, number> {
  const flaggedCalls = new Set<string>()
  for (const g of run.graders) {
    if (g.passed || g.severity !== 'safety' || g.failedAtStep === undefined) continue
    const step = run.steps[g.failedAtStep]
    if (step?.type === 'tool_call') flaggedCalls.add(step.callId)
  }
  const harmful = new Map<string, number>()
  run.steps.forEach((s, i) => {
    if (s.type === 'tool_result' && flaggedCalls.has(s.callId))
      for (const d of s.worldDiff ?? []) harmful.set(d.path, i)
  })
  return harmful
}

/** Steps where the fault layer altered a tool result. */
export const faultSteps = (run: Run) =>
  run.steps.flatMap((s, i) => (s.type === 'tool_result' && s.injectedFault ? [i] : []))

/** Clamps a step from the URL to the trace; anything unparsable becomes 0. */
export function parseStep(raw: string | null, stepCount: number): number {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(stepCount - 1, n))
}
