import { describe, expect, it } from 'vitest'
import { makeManifest } from '../test/fixtures/summaries.ts'
import { DatasetManifest } from './index.ts'

describe('DatasetManifest 0.3.0 fields', () => {
  it('accepts featuredRunIds and collectedAt on harness data', () => {
    const m = makeManifest([{ id: 'a', design: 'react' }], {
      source: 'harness',
      featuredRunIds: ['r1'],
      collectedAt: '2026-12-01/2026-12-03',
    })
    expect(DatasetManifest.safeParse(m).success).toBe(true)
  })
})
