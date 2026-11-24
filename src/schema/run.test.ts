import { describe, expect, it } from 'vitest'
import { makeRun } from '../test/fixtures/minimal-run.ts'
import { faultKey, getAtPointer, Run, RunSummary, setAtPointer, toSummary } from './index.ts'
import type { Step } from './index.ts'

/** Parses and returns the issue messages, so tests can assert on the rule that fired. */
function issues(input: unknown, schema: typeof Run | typeof RunSummary = Run): string[] {
  const r = schema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

/** Replaces a step in the fixture with a looser type, for constructing invalid data. */
function withStep(i: number, patch: Record<string, unknown>) {
  const run = makeRun() as unknown as { steps: Record<string, unknown>[] }
  run.steps[i] = { ...run.steps[i], ...patch }
  return run
}

describe('Run schema', () => {
  it('accepts the hand-written fixture', () => {
    expect(issues(makeRun())).toEqual([])
  })

  it('rejects an outcome that disagrees with the graders', () => {
    const run = makeRun()
    run.outcome = 'unsafe'
    expect(issues(run)).toContainEqual(expect.stringContaining('graders imply "success"'))
  })

  it('rejects "none" as a fault id (baseline is an empty array)', () => {
    const run = makeRun() as unknown as { faults: unknown[] }
    run.faults = [{ id: 'none' }]
    expect(issues(run).length).toBeGreaterThan(0)
  })

  it('rejects a tool_result without an earlier tool_call', () => {
    expect(issues(withStep(7, { callId: 'c99' }))).toContainEqual(
      expect.stringContaining('no earlier tool_call'),
    )
  })

  it('rejects a second result for the same call', () => {
    expect(issues(withStep(7, { callId: 'c2' }))).toContainEqual(
      expect.stringContaining('already has a result'),
    )
  })

  it('rejects decreasing timestamps', () => {
    expect(issues(withStep(6, { tMs: 100 }))).toContainEqual(
      expect.stringContaining('tMs must not decrease'),
    )
  })

  it('rejects step indices that do not match their position', () => {
    expect(issues(withStep(3, { index: 4 }))).toContainEqual(expect.stringContaining('expected 3'))
  })

  it('rejects a tool_call without args (discriminated union)', () => {
    const run = makeRun() as unknown as { steps: Record<string, unknown>[] }
    delete run.steps[1]!.args
    expect(issues(run).length).toBeGreaterThan(0)
  })

  it('rejects ok:false without an error, and ok:true with one', () => {
    expect(issues(withStep(4, { error: undefined }))).toContainEqual(
      expect.stringContaining('error is required'),
    )
    expect(issues(withStep(2, { error: { kind: 'other', message: 'x' } }))).toContainEqual(
      expect.stringContaining('error must be absent'),
    )
  })

  it('rejects an injected fault that is not configured for the run', () => {
    expect(issues(withStep(4, { injectedFault: { id: 'stale_data', note: 'x' } }))).toContainEqual(
      expect.stringContaining('not in the run'),
    )
  })

  it('rejects world changes from read-only tools', () => {
    const diff = [{ path: '/orders/4402/status', before: 'delivered', after: 'refunded' }]
    expect(issues(withStep(7, { worldDiff: diff }))).toContainEqual(
      expect.stringContaining('read-only'),
    )
  })

  it('rejects a diff whose "before" does not match the replayed world', () => {
    const run = makeRun()
    const step = run.steps[9] as Extract<Step, { type: 'tool_result' }>
    step.worldDiff![1]!.before = 'shipped'
    expect(issues(run)).toContainEqual(expect.stringContaining('does not match the replayed world'))
  })

  it('rejects diffs that leave the world in an invalid state', () => {
    const run = makeRun()
    const step = run.steps[9] as Extract<Step, { type: 'tool_result' }>
    step.worldDiff![1]!.after = 'teleported'
    expect(issues(run)).toContainEqual(expect.stringContaining('invalid world'))
  })

  it('rejects totalTokens that do not match the steps', () => {
    const run = makeRun()
    run.totalTokens += 1
    expect(issues(run)).toContainEqual(expect.stringContaining('steps sum to'))
  })

  it('rejects an escalated flag that the trace does not support', () => {
    const run = makeRun()
    run.escalated = true
    expect(issues(run)).toContainEqual(expect.stringContaining('the trace says false'))
  })

  it('requires the injection grader on prompt_injection runs', () => {
    const run = makeRun()
    run.faults = [{ id: 'prompt_injection' }]
    ;(run.steps[4] as Extract<Step, { type: 'tool_result' }>).injectedFault = {
      id: 'prompt_injection',
      note: 'x',
    }
    expect(issues(run)).toContainEqual(expect.stringContaining('"injection_resisted"'))
  })

  it('rejects failedAtStep on a passed grader and past the last step', () => {
    const run = makeRun()
    run.graders[0]!.failedAtStep = 3
    expect(issues(run)).toContainEqual(expect.stringContaining('only allowed on failed graders'))
    const run2 = makeRun()
    run2.graders[2] = { ...run2.graders[2]!, passed: false, failedAtStep: 99 }
    run2.outcome = 'unsafe'
    expect(issues(run2)).toContainEqual(expect.stringContaining('past the last step'))
  })

  it('rejects unknown fields (strict objects catch typos)', () => {
    const run = makeRun() as unknown as Record<string, unknown>
    run.totalToken = 5
    expect(issues(run).length).toBeGreaterThan(0)
  })
})

describe('RunSummary', () => {
  it('toSummary drops the trace and keeps a valid summary', () => {
    const summary = toSummary(makeRun())
    expect(issues(summary, RunSummary)).toEqual([])
    expect(summary.stepCount).toBe(13)
    expect('steps' in summary).toBe(false)
    expect('initialWorld' in summary).toBe(false)
  })

  it('applies the shared outcome check to summaries too', () => {
    const summary = { ...toSummary(makeRun()), outcome: 'failure' }
    expect(issues(summary, RunSummary)).toContainEqual(expect.stringContaining('graders imply'))
  })
})

describe('helpers', () => {
  it('faultKey is "none" for baseline and sorted for combinations', () => {
    expect(faultKey([])).toBe('none')
    expect(faultKey([{ id: 'timeout' }])).toBe('timeout')
    expect(faultKey([{ id: 'timeout' }, { id: 'stale_data' }])).toBe('stale_data+timeout')
  })

  it('JSON Pointer get/set follow RFC 6901 escaping', () => {
    const doc: Record<string, unknown> = {}
    setAtPointer(doc, '/a~1b/c~0d', 1)
    expect(doc).toEqual({ 'a/b': { 'c~d': 1 } })
    expect(getAtPointer(doc, '/a~1b/c~0d')).toBe(1)
    expect(getAtPointer(doc, '/missing/x')).toBeNull()
    setAtPointer(doc, '/a~1b/c~0d', null)
    expect(doc).toEqual({ 'a/b': {} })
  })
})

describe('schema 0.3.0 fields', () => {
  it('accepts faultFired on a run with a fault', () => {
    const run = { ...makeRun(), faultFired: true }
    expect(issues(run)).toEqual([])
    expect(issues({ ...toSummary(makeRun()), faultFired: false }, RunSummary)).toEqual([])
  })

  it('rejects faultFired on a baseline run', () => {
    const summary = { ...toSummary(makeRun()), faults: [], faultFired: false }
    expect(issues(summary, RunSummary)).toContainEqual(
      expect.stringContaining('faultFired requires a fault'),
    )
  })

  it('accepts modelId and reasoningEffort on the agent', () => {
    const run = makeRun()
    const agent = { ...run.agent, modelId: 'claude-haiku-5-5', reasoningEffort: 'medium' }
    expect(issues({ ...run, agent })).toEqual([])
  })

  it('accepts payments in the world', () => {
    const run = makeRun()
    const initialWorld = {
      ...run.initialWorld,
      payments: {
        'P-1': { orderId: '4402', amount: 289, currency: 'NOK', capturedAt: '2026-11-10' },
      },
    }
    expect(issues({ ...run, initialWorld })).toEqual([])
  })
})
