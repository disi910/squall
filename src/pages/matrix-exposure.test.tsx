// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { makeManifest, makeSummary } from '../test/fixtures/summaries.ts'

vi.mock('../data/load.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/load.ts')>()
  const { computeAnalysis } = await import('../data/analysis.ts')
  const manifest = makeManifest([{ id: 'a', design: 'react' }], {
    source: 'harness',
    faultSettings: [[], [{ id: 'timeout' }]],
  })
  const runs = [
    makeSummary({ agent: 'a' }),
    makeSummary({ agent: 'a', seed: 1, faults: ['timeout'], faultFired: true }),
    makeSummary({ agent: 'a', seed: 2, faults: ['timeout'], faultFired: false }),
  ]
  return { ...actual, loadAnalysis: () => Promise.resolve(computeAnalysis({ manifest, runs })) }
})

const { routes } = await import('../routes.tsx')

beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(cleanup)

describe('robustness matrix with harness data', () => {
  it('says how often the fault reached the agent', async () => {
    await act(async () => {
      render(
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/matrix'] })} />,
      )
    })
    await screen.findByRole('grid', {}, { timeout: 5000 })
    const cell = screen
      .getAllByRole('gridcell')
      .find((c) => /Timeout\./.test(c.getAttribute('aria-label') ?? ''))
    expect(cell?.getAttribute('aria-label')).toMatch(/The fault reached the agent in 1 of 2 runs\./)
  })
})
