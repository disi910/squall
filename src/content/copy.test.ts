import { describe, expect, it } from 'vitest'
import { copyFor, stepsSentence } from './copy.ts'

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
