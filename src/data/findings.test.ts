import { describe, expect, it } from 'vitest'
import type { RunSummary } from '../schema/index.ts'
import { makeManifest, makeSummary } from '../test/fixtures/summaries.ts'
import { computeFindings } from './findings.ts'

const manifest = makeManifest([
  { id: 'a', design: 'react' },
  { id: 'v', design: 'react_with_verifier' },
])

const repeat = (n: number, make: (i: number) => RunSummary) =>
  Array.from({ length: n }, (_, i) => make(i))

// Successful runs take 10 steps, failed and unsafe runs 20, so the step ratio is exactly 2.
const runs: RunSummary[] = [
  ...repeat(2, (i) => makeSummary({ agent: 'a', seed: i })),
  ...repeat(2, (i) => makeSummary({ agent: 'v', design: 'react_with_verifier', seed: i })),
  makeSummary({ agent: 'a', seed: 9, outcome: 'failure', steps: 20 }),
  // Silent failure: ReAct 1/4, verifier 3/4.
  ...repeat(4, (i) =>
    makeSummary({
      agent: 'a',
      seed: i,
      faults: ['silent_failure'],
      ...(i > 0 ? { outcome: 'failure', steps: 20 } : {}),
    }),
  ),
  ...repeat(4, (i) =>
    makeSummary({
      agent: 'v',
      design: 'react_with_verifier',
      seed: i,
      faults: ['silent_failure'],
      ...(i === 0 ? { outcome: 'failure', steps: 20 } : {}),
    }),
  ),
  // Injection: agent a follows it 3/4 times, v 1/4.
  ...repeat(4, (i) =>
    makeSummary({
      agent: 'a',
      seed: i,
      faults: ['prompt_injection'],
      ...(i < 3 ? { outcome: 'unsafe', followedInjection: true, steps: 20 } : {}),
    }),
  ),
  ...repeat(4, (i) =>
    makeSummary({
      agent: 'v',
      design: 'react_with_verifier',
      seed: i,
      faults: ['prompt_injection'],
      ...(i === 0 ? { outcome: 'unsafe', followedInjection: true, steps: 20 } : {}),
    }),
  ),
]

describe('computeFindings', () => {
  const f = computeFindings({ manifest, runs })

  it('finds the agent that follows injected instructions most often', () => {
    expect(f.mostInjectable?.agent.id).toBe('a')
    expect(f.mostInjectable?.rate.rate).toBe(0.75)
  })

  it('compares the verifier with plain ReAct on silent failure', () => {
    expect(f.verifierOnSilentFailure?.react.rate).toBe(0.25)
    expect(f.verifierOnSilentFailure?.verifier.rate).toBe(0.75)
  })

  it('compares mean steps of failed and successful runs', () => {
    expect(f.steps).toEqual({ failed: 20, succeeded: 10 })
  })

  it('lists success by fault in manifest order, with intervals', () => {
    expect(f.successByFault.map((d) => d.key)).toEqual([
      'none',
      'silent_failure',
      'prompt_injection',
    ])
    expect(f.successByFault[0]!.rate.n).toBe(5)
    expect(f.runCount).toBe(runs.length)
  })

  it('names the hardest single fault', () => {
    expect(f.hardestFault?.key).toBe('silent_failure')
  })

  it('hides the verifier comparison when only one design has run', () => {
    const one = computeFindings({
      manifest: makeManifest([{ id: 'a', design: 'react' }]),
      runs: [makeSummary({ agent: 'a', faults: ['silent_failure'] })],
    })
    expect(one.verifierOnSilentFailure).toBeNull()
  })

  it('returns empty findings instead of crashing on no data', () => {
    const empty = computeFindings({ manifest, runs: [] })
    expect(empty.mostInjectable).toBeNull()
    expect(empty.verifierOnSilentFailure).toBeNull()
    expect(empty.steps).toBeNull()
    expect(empty.successByFault).toEqual([])
  })
})
