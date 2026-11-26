import { describe, expect, it } from 'vitest'
import { bannerChip, bannerText, buildDataFrom } from './banner.ts'

describe('bannerText', () => {
  it('keeps the simulated-data notice for simulated data', () => {
    expect(bannerText('simulated', 9)).toBe(
      'Preview: all results shown are simulated placeholder data.',
    )
    expect(bannerChip('simulated', 9)).toBe('Preview')
  })

  it('says what is real for harness data, and flags a one-model trial', () => {
    expect(bannerText('harness', 1)).toBe(
      'Real model runs against a simulated support desk: the agents are real; the tasks, tools and faults are simulated. Trial: one model so far.',
    )
    expect(bannerChip('harness', 1)).toBe('Trial')
  })

  it('drops the trial note once several models have run', () => {
    expect(bannerText('harness', 3)).not.toContain('Trial')
    expect(bannerChip('harness', 3)).toBe('Real runs')
  })
})

describe('buildDataFrom', () => {
  const agent = (modelLabel: string, agentDesign = 'react') => ({ modelLabel, agentDesign })

  it('counts models, not agent configs', () => {
    // Phase 2: three agent designs on one model are still one model.
    const data = buildDataFrom({
      source: 'harness',
      agents: [
        agent('Claude Haiku 5.5', 'plan_execute'),
        agent('Claude Haiku 5.5', 'react'),
        agent('Claude Haiku 5.5', 'react_with_verifier'),
      ],
      seeds: [1, 2, 3],
      featuredRunIds: ['r1', 'r2'],
    })
    expect(data).toEqual({
      source: 'harness',
      models: ['Claude Haiku 5.5'],
      designs: ['react', 'react_with_verifier', 'plan_execute'],
      seedCount: 3,
      featured: 'r1',
    })
    expect(bannerChip(data.source, data.models.length)).toBe('Trial')
  })

  it('keeps each model once, in manifest order', () => {
    const data = buildDataFrom({
      source: 'harness',
      agents: [agent('B'), agent('A'), agent('B')],
      seeds: [1],
    })
    expect(data.models).toEqual(['B', 'A'])
    expect(data.featured).toBeNull()
  })
})
