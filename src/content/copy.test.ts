import { describe, expect, it } from 'vitest'
import { copyFor, stepsSentence, verifierSentence } from './copy.ts'

describe('copy for the data source', () => {
  it('labels simulated findings as examples and real ones as observations', () => {
    expect(copyFor('simulated').findingEyebrow('injection')).toBe('Example finding · injection')
    expect(copyFor('harness').findingEyebrow('injection')).toBe('Finding · injection')
    expect(copyFor('harness').findingsNote(1, 1)).toMatch(/^Observed in/)
    expect(copyFor('harness').findingsNote(1, 1)).toContain('one model and one seed per setting')
    expect(copyFor('harness').findingsNote(1, 3)).toContain('one model and 3 seeds per setting')
    expect(copyFor('harness').findingsNote(3, 3)).toContain('3 models and 3 seeds per setting')
    expect(copyFor('harness').chartCaption).not.toMatch(/simulated/i)
  })

  it('counts agents from the manifest, without placeholder wording for real runs', () => {
    expect(copyFor('harness').leaderboardIntro(1)).toMatch(/^1 agent config: /)
    expect(copyFor('harness').leaderboardIntro(1)).not.toMatch(/placeholder/)
    expect(copyFor('simulated').leaderboardIntro(9)).toMatch(/^9 agent configs: placeholder models/)
    expect(copyFor('harness').datasetLine(160, 1, 8, 20, 1)).toBe(
      '160 runs · 1 agent config · 8 fault settings · 20 tasks · 1 seed',
    )
  })

  it('names the models from the dataset in the agent step', () => {
    const step = copyFor('harness').agentStep
    expect(step(['Claude Haiku 5.5'])).toBe(
      'A real model (Claude Haiku 5.5) runs a ReAct loop over the shop’s tools.',
    )
    expect(step(['Claude Haiku 5.5', 'Claude Sonnet 5.5'])).toBe(
      'Real models (Claude Haiku 5.5 and Claude Sonnet 5.5) run a ReAct loop over the shop’s tools.',
    )
    expect(step(['A', 'B', 'C'])).toContain('(A, B and C) run')
    expect(step(['A', 'B', 'C', 'D'])).toContain('Real models (4 of them) run')
    expect(step([])).toBe('A real model runs a ReAct loop over the shop’s tools.')
    expect(copyFor('simulated').agentStep(['Claude Haiku 5.5'])).toMatch(/placeholder models/)
  })

  it('names the agent designs once more than ReAct has run', () => {
    const real = copyFor('harness')
    const all = ['react', 'react_with_verifier', 'plan_execute']
    expect(real.agentStep(['Claude Haiku 5.5'], ['react'])).toBe(
      'A real model (Claude Haiku 5.5) runs a ReAct loop over the shop’s tools.',
    )
    expect(real.agentStep(['Claude Haiku 5.5'], all)).toBe(
      'A real model (Claude Haiku 5.5) runs as 3 reference agents over the shop’s tools: ReAct, ReAct + verifier and Plan-and-execute.',
    )
    expect(real.leaderboardIntro(1, ['react'])).toBe(
      '1 agent config: real models running a ReAct agent.',
    )
    expect(real.leaderboardIntro(3, all)).toBe(
      '3 agent configs: real models running 3 reference agent designs.',
    )
  })

  it('words the verifier finding by its direction and by the models it pools', () => {
    expect(verifierSentence(0, 0.3, ['Claude Haiku 5.5'])).toBe(
      'A verifier step lifts success under silent failure from 0% to 30% on Claude Haiku 5.5.',
    )
    expect(verifierSentence(0.5, 0.2, ['A', 'B'])).toBe(
      'A verifier step lowers success under silent failure from 50% to 20%, pooled over models.',
    )
    expect(verifierSentence(0, 0.001, ['Claude Haiku 5.5'])).toMatch(/leaves success .* unchanged/)
  })

  it('mentions golden traces only for data that has them', () => {
    expect(copyFor('simulated').goldenNote).toMatch(/golden traces/)
    expect(copyFor('harness').goldenNote).toBe('')
  })

  it('words the step comparison by its actual direction', () => {
    expect(stepsSentence(20, 10)).toMatch(/take more steps/)
    expect(stepsSentence(14.0, 14.4)).toMatch(/take about as many steps/)
    expect(stepsSentence(8, 12)).toMatch(/take fewer steps/)
  })
})
