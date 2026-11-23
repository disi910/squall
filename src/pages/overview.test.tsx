// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { RunSummary } from '../schema/index.ts'
import { makeManifest, makeSummary } from '../test/fixtures/summaries.ts'

// Two agents with known numbers. Agent "a" (ReAct): baseline 2/2, silent 0/2,
// injection followed 2/2. Agent "v" (verifier): baseline 1/2, silent 2/2, injection 0/2.
vi.mock('../data/load.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/load.ts')>()
  const { computeAnalysis } = await import('../data/analysis.ts')
  const manifest = makeManifest([
    { id: 'a', design: 'react' },
    { id: 'v', design: 'react_with_verifier' },
  ])
  const v = { agent: 'v', design: 'react_with_verifier' as const }
  const runs: RunSummary[] = [
    makeSummary({ agent: 'a', seed: 1 }),
    makeSummary({ agent: 'a', seed: 2 }),
    makeSummary({ ...v, seed: 1 }),
    makeSummary({ ...v, seed: 2, outcome: 'failure' }),
    makeSummary({ agent: 'a', seed: 1, faults: ['silent_failure'], outcome: 'failure' }),
    makeSummary({ agent: 'a', seed: 2, faults: ['silent_failure'], outcome: 'failure' }),
    makeSummary({ ...v, seed: 1, faults: ['silent_failure'] }),
    makeSummary({ ...v, seed: 2, faults: ['silent_failure'] }),
    makeSummary({
      agent: 'a',
      seed: 1,
      faults: ['prompt_injection'],
      outcome: 'unsafe',
      followedInjection: true,
    }),
    makeSummary({
      agent: 'a',
      seed: 2,
      faults: ['prompt_injection'],
      outcome: 'unsafe',
      followedInjection: true,
    }),
    makeSummary({ ...v, seed: 1, faults: ['prompt_injection'] }),
    makeSummary({ ...v, seed: 2, faults: ['prompt_injection'] }),
  ]
  const analysis = Promise.resolve(computeAnalysis({ manifest, runs }))
  return { ...actual, loadAnalysis: () => analysis }
})

const { routes } = await import('../routes.tsx')

beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(cleanup)

/**
 * Rendered inside an awaited act(): React 19 does not retry a suspended render
 * in a synchronous act scope, and the pages suspend on their data.
 */
async function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  return router
}
/** Router navigations run as React transitions; awaiting act lets them commit before the next event. */
const click = (el: Element) => act(async () => void fireEvent.click(el))
const change = (el: Element, value: string) =>
  act(async () => void fireEvent.change(el, { target: { value } }))
const keyDown = (el: Element, key: string) => act(async () => void fireEvent.keyDown(el, { key }))
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const firstAgentDesign = () => bodyRows()[0]!.querySelector('th')!.textContent

describe('leaderboard', () => {
  it('sorts by success under faults, best first, by default', async () => {
    await renderAt('/leaderboard')
    await screen.findByRole('table')
    // v: 2/4 under faults beats a: 0/4.
    expect(firstAgentDesign()).toContain('ReAct + verifier')
    expect(
      screen.getByRole('columnheader', { name: /Success under faults/ }).getAttribute('aria-sort'),
    ).toBe('descending')
  })

  it('sorts lower-is-better columns ascending on first click and stores it in the URL', async () => {
    const router = await renderAt('/leaderboard')
    await screen.findByRole('table')
    await click(screen.getByRole('button', { name: /Injection compliance/ }))
    expect(router.state.location.search).toBe('?sort=injection&dir=asc')
    expect(firstAgentDesign()).toContain('ReAct + verifier')
    await click(screen.getByRole('button', { name: /Injection compliance/ }))
    expect(firstAgentDesign()).not.toContain('verifier')
  })

  it('keeps the sort when the fault filter changes', async () => {
    const router = await renderAt('/leaderboard')
    await screen.findByRole('table')
    await click(screen.getByRole('button', { name: /Safety violations/ }))
    await change(screen.getByLabelText(/Fault setting/), 'silent_failure')
    const search = new URLSearchParams(router.state.location.search)
    expect(search.get('sort')).toBe('safety')
    expect(search.get('fault')).toBe('silent_failure')
    expect(screen.getByRole('button', { name: /Success: silent failure/ })).toBeTruthy()
  })

  it('shows every rate with its interval and sample size', async () => {
    await renderAt('/leaderboard')
    await screen.findByRole('table')
    // Baseline for agent a: 2/2, Wilson interval 34–100.
    expect(screen.getAllByText('[34–100] n=2').length).toBeGreaterThan(0)
  })

  it('falls back to defaults on unknown URL values', async () => {
    await renderAt('/leaderboard?sort=bogus&fault=nope')
    await screen.findByRole('table')
    expect(
      screen.getByRole('columnheader', { name: /Success under faults/ }).getAttribute('aria-sort'),
    ).toBe('descending')
  })
})

describe('robustness matrix', () => {
  const cell = (name: RegExp) => screen.getByRole('gridcell', { name })

  it('renders one cell per agent and fault setting with the rate and CI in its label', async () => {
    await renderAt('/matrix')
    await screen.findByRole('grid')
    expect(screen.getAllByRole('gridcell')).toHaveLength(2 * 3)
    // The label starts with the visible text ("100% ±33"), then says what and where.
    expect(
      cell(
        /^100% ±33: Success for Model X, ReAct \+ verifier, Silent failure\. 95% CI 34–100, n=2\./,
      ),
    ).toBeTruthy()
  })

  it('switches metric and marks the baseline as the recovery reference', async () => {
    const router = await renderAt('/matrix')
    await screen.findByRole('grid')
    await click(screen.getByRole('button', { name: 'Recovery' }))
    expect(router.state.location.search).toBe('?metric=recovery')
    expect(cell(/^ref\.: Model X, ReAct, Baseline, no recovery value/)).toBeTruthy()
    // Agent v solved only seed 1 at baseline, and still solved it under silent failure: 1/1.
    expect(
      cell(/^100% .*Recovery for Model X, ReAct \+ verifier, Silent failure\..*n=1\./),
    ).toBeTruthy()
  })

  it('has a single tab stop and moves focus with the arrow keys', async () => {
    await renderAt('/matrix')
    await screen.findByRole('grid')
    const tabbable = screen
      .getAllByRole('gridcell')
      .filter((c) => c.getAttribute('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
    act(() => tabbable[0]!.focus())
    await keyDown(tabbable[0]!, 'ArrowRight')
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /for Model X, ReAct, Silent failure\./,
    )
    await keyDown(document.activeElement!, 'ArrowDown')
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /for Model X, ReAct \+ verifier, Silent failure\./,
    )
  })

  it('opens the filtered run list on click and on Enter', async () => {
    const router = await renderAt('/matrix')
    await screen.findByRole('grid')
    await keyDown(cell(/for Model X, ReAct, Silent failure\./), 'Enter')
    expect(router.state.location.pathname).toBe('/runs')
    expect(router.state.location.search).toBe('?agent=a&fault=silent_failure')
  })
})
