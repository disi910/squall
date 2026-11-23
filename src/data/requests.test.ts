import { describe, expect, it } from 'vitest'
import { makeManifest, makeSummary } from '../test/fixtures/summaries.ts'
import { buildRunIndex, handleRequest } from './requests.ts'

const runs = [
  makeSummary({ agent: 'a', seed: 1, faults: ['timeout'], steps: 14, tokens: 5000 }),
  makeSummary({ agent: 'a', seed: 2, outcome: 'failure' }),
]
const manifest = makeManifest([{ id: 'a', design: 'react' }], { tracedRunIds: [runs[0]!.id] })

describe('run index', () => {
  it('keeps only what the explorer needs, with the fault key and trace flag', () => {
    expect(buildRunIndex({ manifest, runs })).toEqual([
      {
        id: runs[0]!.id,
        agentId: 'a',
        taskId: 'T1',
        faultKey: 'timeout',
        seed: 1,
        outcome: 'success',
        stepCount: 14,
        totalTokens: 5000,
        traced: true,
      },
      {
        id: runs[1]!.id,
        agentId: 'a',
        taskId: 'T1',
        faultKey: 'none',
        seed: 2,
        outcome: 'failure',
        stepCount: 10,
        totalTokens: 1000,
        traced: false,
      },
    ])
  })
})

describe('handleRequest', () => {
  it('looks up single summaries, or returns null for unknown ids', () => {
    expect(handleRequest({ manifest, runs }, { kind: 'summary', runId: runs[1]!.id })).toBe(runs[1])
    expect(handleRequest({ manifest, runs }, { kind: 'summary', runId: 'nope' })).toBeNull()
  })

  it('answers analysis requests with the same computation the pages use', () => {
    const analysis = handleRequest({ manifest, runs }, { kind: 'analysis' })
    expect(analysis).toHaveProperty('matrix.a')
  })
})
