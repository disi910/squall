import { describe, expect, it } from 'vitest'
import { bannerChip, bannerText } from './banner.ts'

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
