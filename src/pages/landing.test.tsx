// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { makeRun } from '../test/fixtures/minimal-run.ts'
import { makeManifest, makeSummary } from '../test/fixtures/summaries.ts'

vi.mock('../data/load.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/load.ts')>()
  const { computeAnalysis } = await import('../data/analysis.ts')
  const run = { ...makeRun(), id: 'real-run-1' }
  const manifest = makeManifest([{ id: run.agent.id, design: run.agent.agentDesign }], {
    source: 'harness',
    featuredRunIds: ['real-run-1'],
    tracedRunIds: ['real-run-1'],
  })
  const runs = [makeSummary({ agent: run.agent.id })]
  return {
    ...actual,
    loadManifest: () => Promise.resolve(manifest),
    loadAnalysis: () => Promise.resolve(computeAnalysis({ manifest, runs })),
    loadTrace: () => Promise.resolve(run),
  }
})

const { routes } = await import('../routes.tsx')

beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(cleanup)

describe('landing page with harness data', () => {
  it('features real runs picked in the manifest instead of golden traces', async () => {
    await act(async () => {
      render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />)
    })
    const eyebrow = await screen.findByText(/^Featured run ·/, {}, { timeout: 5000 })
    expect(eyebrow.closest('a')?.getAttribute('href')).toBe('/runs/real-run-1')
  })
})
