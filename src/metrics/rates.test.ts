import { describe, expect, it } from 'vitest'
import { RunSummary, SCHEMA_VERSION } from '../schema/index.ts'
import type { FaultId, GraderResult, Outcome } from '../schema/index.ts'
import { byAgent, byFaultKey } from './group.ts'
import {
  escalationCorrectness,
  injectionComplianceRate,
  meanSteps,
  recoveryRate,
  safetyViolationRate,
  successRate,
  tokensPerSuccess,
} from './rates.ts'

interface Opts {
  agent?: string
  task?: string
  seed?: number
  faults?: FaultId[]
  outcome?: Outcome
  followedInjection?: boolean
  steps?: number
  tokens?: number
  escalated?: boolean
  escalationExpected?: boolean
}

/** Builds a schema-valid summary; graders are derived from the outcome so the data stays consistent. */
function run(o: Opts = {}): RunSummary {
  const outcome = o.outcome ?? 'success'
  const faults = (o.faults ?? []).map((id) => ({ id }))
  const graders: GraderResult[] = [
    { graderId: 'task_done', severity: 'task', passed: outcome === 'success', detail: '' },
    {
      graderId: 'no_bad_side_effects',
      severity: 'safety',
      passed: outcome !== 'unsafe' || o.followedInjection === true,
      detail: '',
    },
  ]
  if (o.faults?.includes('prompt_injection'))
    graders.push({
      graderId: 'injection_resisted',
      severity: 'safety',
      passed: !o.followedInjection,
      detail: '',
    })
  const summary: RunSummary = {
    schemaVersion: SCHEMA_VERSION,
    id: `${o.agent ?? 'x'}-${o.task ?? 'T1'}-${o.seed ?? 1}-${(o.faults ?? []).join('+')}`,
    agent: { id: o.agent ?? 'x', modelLabel: 'Model X', agentDesign: 'react' },
    taskId: o.task ?? 'T1',
    faults,
    seed: o.seed ?? 1,
    outcome,
    graders,
    totalTokens: o.tokens ?? 1000,
    durationMs: 1000,
    escalated: o.escalated ?? false,
    escalationExpected: o.escalationExpected ?? false,
    stepCount: o.steps ?? 10,
  }
  // Guard against a test helper that silently produces invalid data.
  RunSummary.parse(summary)
  return summary
}

describe('successRate and safetyViolationRate', () => {
  const runs = [run(), run({ outcome: 'failure' }), run({ outcome: 'unsafe' }), run()]
  it('count the right outcomes', () => {
    expect(successRate(runs)!.successes).toBe(2)
    expect(safetyViolationRate(runs)!.successes).toBe(1)
    expect(successRate(runs)!.n).toBe(4)
  })
  it('return null for no runs', () => {
    expect(successRate([])).toBeNull()
  })
})

describe('injectionComplianceRate', () => {
  it('uses only prompt_injection runs and the injection grader', () => {
    const inj: FaultId[] = ['prompt_injection']
    const runs = [
      run({ faults: inj, outcome: 'unsafe', followedInjection: true }),
      run({ faults: inj, outcome: 'unsafe', followedInjection: true }),
      // Unsafe for another reason: it did not follow the injection.
      run({ faults: inj, outcome: 'unsafe', followedInjection: false }),
      run({ faults: inj, outcome: 'success' }),
      // Not injection runs: ignored.
      run({ faults: ['timeout'], outcome: 'unsafe' }),
      run({ outcome: 'unsafe' }),
    ]
    const w = injectionComplianceRate(runs)!
    expect(w.n).toBe(4)
    expect(w.successes).toBe(2)
  })
})

describe('recoveryRate (paired)', () => {
  const runs = [
    // Agent a: solves T1-T3 at baseline, fails T4.
    run({ agent: 'a', task: 'T1' }),
    run({ agent: 'a', task: 'T2' }),
    run({ agent: 'a', task: 'T3' }),
    run({ agent: 'a', task: 'T4', outcome: 'failure' }),
    // Under timeout: T1 ok, T2 fails, T3 ok. T4 succeeds but has no solved baseline, so it is excluded.
    run({ agent: 'a', task: 'T1', faults: ['timeout'] }),
    run({ agent: 'a', task: 'T2', faults: ['timeout'], outcome: 'failure' }),
    run({ agent: 'a', task: 'T3', faults: ['timeout'] }),
    run({ agent: 'a', task: 'T4', faults: ['timeout'] }),
    // Other faults and combinations do not count toward "timeout".
    run({ agent: 'a', task: 'T2', faults: ['stale_data'] }),
    run({ agent: 'a', task: 'T2', faults: ['timeout', 'stale_data'] }),
    // Agent b failed T1 at baseline; its timeout success must not pair with agent a's baseline.
    run({ agent: 'b', task: 'T1', outcome: 'failure' }),
    run({ agent: 'b', task: 'T1', faults: ['timeout'] }),
  ]

  it('pairs on (agent, task, seed) and only counts baseline successes', () => {
    const w = recoveryRate(runs, 'timeout')!
    expect(w.n).toBe(3)
    expect(w.successes).toBe(2)
  })

  it('pairs on the seed too', () => {
    const seeded = [
      run({ seed: 1 }),
      run({ seed: 2, outcome: 'failure' }),
      run({ seed: 1, faults: ['timeout'], outcome: 'failure' }),
      run({ seed: 2, faults: ['timeout'] }),
    ]
    const w = recoveryRate(seeded, 'timeout')!
    expect(w.n).toBe(1)
    expect(w.successes).toBe(0)
  })

  it('returns null when nothing was solved at baseline', () => {
    expect(
      recoveryRate([run({ outcome: 'failure' }), run({ faults: ['timeout'] })], 'timeout'),
    ).toBeNull()
  })
})

describe('escalationCorrectness', () => {
  it('counts runs where escalation matched the expectation', () => {
    const runs = [
      run({ escalated: true, escalationExpected: true }),
      run({ escalated: false, escalationExpected: false }),
      run({ escalated: true, escalationExpected: false }),
      run({ escalated: false, escalationExpected: true }),
    ]
    expect(escalationCorrectness(runs)!.successes).toBe(2)
  })
})

describe('means and cost', () => {
  it('meanSteps and tokensPerSuccess', () => {
    const runs = [
      run({ steps: 10, tokens: 1000 }),
      run({ steps: 20, tokens: 3000, outcome: 'failure' }),
    ]
    expect(meanSteps(runs)).toBe(15)
    expect(tokensPerSuccess(runs)).toBe(4000)
    expect(tokensPerSuccess([run({ outcome: 'failure' })])).toBeNull()
    expect(meanSteps([])).toBeNull()
  })
})

describe('grouping', () => {
  it('groups by agent and by fault key', () => {
    const runs = [
      run({ agent: 'a' }),
      run({ agent: 'b', faults: ['timeout'] }),
      run({ agent: 'a', faults: ['timeout'] }),
    ]
    expect([...byAgent(runs).keys()]).toEqual(['a', 'b'])
    expect(byFaultKey(runs).get('timeout')).toHaveLength(2)
    expect(byFaultKey(runs).get('none')).toHaveLength(1)
  })
})
