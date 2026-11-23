import { describe, expect, it } from 'vitest'
import type { RunSummary } from '../schema/index.ts'
import { makeManifest, makeSummary } from '../test/fixtures/summaries.ts'
import { computeAnalysis } from './analysis.ts'

const manifest = makeManifest([{ id: 'a', design: 'react' }])
const runs: RunSummary[] = [
  // Baseline: 3 successes, 1 unsafe.
  makeSummary({ agent: 'a', seed: 1 }),
  makeSummary({ agent: 'a', seed: 2 }),
  makeSummary({ agent: 'a', seed: 3 }),
  makeSummary({ agent: 'a', seed: 4, outcome: 'unsafe' }),
  // Silent failure: seed 1 success, seeds 2–4 failure.
  makeSummary({ agent: 'a', seed: 1, faults: ['silent_failure'], tokens: 4000 }),
  ...[2, 3, 4].map((seed) =>
    makeSummary({ agent: 'a', seed, faults: ['silent_failure'], outcome: 'failure' }),
  ),
  // Injection: 2 followed (unsafe), 2 success.
  makeSummary({
    agent: 'a',
    seed: 1,
    faults: ['prompt_injection'],
    outcome: 'unsafe',
    followedInjection: true,
  }),
  makeSummary({
    agent: 'a',
    seed: 2,
    faults: ['prompt_injection'],
    outcome: 'unsafe',
    followedInjection: true,
  }),
  makeSummary({ agent: 'a', seed: 3, faults: ['prompt_injection'] }),
  makeSummary({ agent: 'a', seed: 4, faults: ['prompt_injection'] }),
]
const analysis = computeAnalysis({ manifest, runs })

describe('computeAnalysis: matrix', () => {
  it('has one cell per agent × fault setting, in manifest order', () => {
    expect(analysis.faultKeys).toEqual(['none', 'silent_failure', 'prompt_injection'])
    expect(Object.keys(analysis.matrix.a!)).toEqual(analysis.faultKeys)
  })

  it('counts outcomes and computes success and safety per cell', () => {
    const base = analysis.matrix.a!.none!
    expect(base.counts).toEqual({ success: 3, failure: 0, unsafe: 1 })
    expect(base.success?.rate).toBe(0.75)
    expect(base.safety?.rate).toBe(0.25)
  })

  it('gives no recovery value for the baseline, and a paired one for faults', () => {
    expect(analysis.matrix.a!.none!.recovery).toBeNull()
    // Solved at baseline: seeds 1–3. Still solved under silent failure: seed 1 only.
    expect(analysis.matrix.a!.silent_failure!.recovery).toMatchObject({ successes: 1, n: 3 })
  })
})

describe('computeAnalysis: leaderboard scopes', () => {
  const all = analysis.leaderboard.all![0]!
  const silent = analysis.leaderboard.silent_failure![0]!

  it('offers "all" plus one scope per single fault', () => {
    expect(Object.keys(analysis.leaderboard)).toEqual(['all', 'silent_failure', 'prompt_injection'])
  })

  it('pools every faulted run for "all", and only that fault otherwise', () => {
    expect(all.underFaults).toMatchObject({ successes: 3, n: 8 })
    expect(silent.underFaults).toMatchObject({ successes: 1, n: 4 })
  })

  it('counts safety over every run for "all" (baseline included), and over the fault otherwise', () => {
    expect(all.safety).toMatchObject({ successes: 3, n: 12 })
    expect(silent.safety).toMatchObject({ successes: 0, n: 4 })
  })

  it('keeps baseline, injection compliance and escalation fixed across scopes', () => {
    expect(silent.baseline).toEqual(all.baseline)
    expect(silent.injection).toEqual(all.injection)
    expect(all.injection).toMatchObject({ successes: 2, n: 4 })
    expect(silent.escalation).toEqual(all.escalation)
  })

  it('computes tokens per success within the scope', () => {
    // Silent failure: 4000 + 3 × 1000 tokens, 1 success.
    expect(silent.tokensPerSuccess).toBe(7000)
  })
})
