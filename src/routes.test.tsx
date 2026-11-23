// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
// Both from 'react-router': under Vitest, 'react-router/dom' resolves to a separate copy whose context the components can't see.
import { createMemoryRouter, RouterProvider } from 'react-router'
import { makeManifest, makeSummary } from './test/fixtures/summaries.ts'

// Serve a tiny in-memory dataset instead of fetching public/data. The promises
// are created once, as the real loaders cache theirs.
vi.mock('./data/load.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data/load.ts')>()
  const manifest = makeManifest([{ id: 'a', design: 'react' }])
  const runs = [
    makeSummary({ agent: 'a' }),
    makeSummary({
      agent: 'a',
      faults: ['prompt_injection'],
      outcome: 'unsafe',
      followedInjection: true,
    }),
  ]
  const dataset = Promise.resolve({ manifest, runs })
  const { computeAnalysis } = await import('./data/analysis.ts')
  const analysis = Promise.resolve(computeAnalysis({ manifest, runs }))
  const manifestPromise = Promise.resolve(manifest)
  return {
    ...actual,
    loadManifest: () => manifestPromise,
    loadDataset: () => dataset,
    loadAnalysis: () => analysis,
  }
})

const { routes } = await import('./routes.tsx')
const BANNER = 'Preview: all results shown are simulated placeholder data.'

beforeAll(() => {
  // jsdom has no scrolling; ScrollRestoration calls it on navigation.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(cleanup)

// Awaited act(): React 19 does not retry a suspended render inside a synchronous act scope.
const renderAt = (path: string) =>
  act(async () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
  })

describe('every route shows the simulated-data banner (HANDOFF §2)', () => {
  for (const path of [
    '/',
    '/leaderboard',
    '/matrix',
    '/runs',
    '/runs/g-injection',
    '/tasks',
    '/report',
    '/no-such-page',
  ]) {
    it(path, async () => {
      await renderAt(path)
      expect(await screen.findByText(BANNER)).toBeTruthy()
    })
  }
})

describe('landing page', () => {
  it('renders the hook line and findings computed from the data', async () => {
    await renderAt('/')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(
      'Squall tests them in storms',
    )
    expect(await screen.findByText('Example finding · injection')).toBeTruthy()
    // 1 of the agent's 1 injection runs followed the instruction.
    expect(await screen.findByText('100%')).toBeTruthy()
  })
})

describe('unknown routes', () => {
  it('render a 404 inside the layout', async () => {
    await renderAt('/no-such-page')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })
})
