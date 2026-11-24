import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { toSummary } from '../../src/schema/index.ts'
import type { DatasetManifest, Run } from '../../src/schema/index.ts'
import { makeRun } from '../../src/test/fixtures/minimal-run.ts'
import { makeManifest } from '../../src/test/fixtures/summaries.ts'
import { validateDataset } from './validate.ts'

/** Writes a one-run dataset folder; `edit` can corrupt it before writing. */
function writeDataset(
  edit: (d: { manifest: DatasetManifest; run: Run; summary: unknown }) => void = () => {},
) {
  const run = makeRun()
  const manifest = makeManifest([{ id: run.agent.id, design: run.agent.agentDesign }], {
    runCount: 1,
    tracedRunIds: [run.id],
  })
  const d = { manifest, run, summary: toSummary(run) as unknown }
  edit(d)
  const dir = mkdtempSync(join(tmpdir(), 'squall-ds-'))
  mkdirSync(join(dir, 'traces'))
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(d.manifest))
  writeFileSync(join(dir, 'runs.json'), JSON.stringify([d.summary]))
  writeFileSync(join(dir, 'traces', `${d.run.id}.json`), JSON.stringify(d.run))
  return dir
}

describe('validateDataset', () => {
  it('finds no problems in a valid folder', () => {
    expect(validateDataset(writeDataset())).toEqual([])
  })

  it('reports a summary that disagrees with its trace', () => {
    const dir = writeDataset((d) => {
      ;(d.summary as { durationMs: number }).durationMs += 1
    })
    expect(validateDataset(dir)).toContainEqual(expect.stringContaining('does not match its trace'))
  })

  it('reports a featured run without a trace', () => {
    const dir = writeDataset((d) => {
      d.manifest.featuredRunIds = ['missing-run']
    })
    expect(validateDataset(dir)).toContainEqual(expect.stringContaining('missing-run'))
  })

  it('reports a wrong runCount', () => {
    const dir = writeDataset((d) => {
      d.manifest.runCount = 2
    })
    expect(validateDataset(dir)).toContainEqual(expect.stringContaining('runCount'))
  })
})
