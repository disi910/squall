// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { RunSummary } from '../schema/index.ts'

// Dataset: the hand-written fixture run (traced), an untraced sibling with the same
// agent, task and fault, and 300 filler runs to exercise the virtual list.
vi.mock('../data/load.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/load.ts')>()
  const { makeRun } = await import('../test/fixtures/minimal-run.ts')
  const { makeManifest, makeSummary } = await import('../test/fixtures/summaries.ts')
  const { toSummary } = await import('../schema/index.ts')
  const { buildRunIndex } = await import('../data/requests.ts')

  const traced = toSummary(makeRun())
  const sibling: RunSummary = {
    ...traced,
    id: 'fixture-002',
    seed: 2,
    outcome: 'failure',
    graders: traced.graders.map((g, i) =>
      i === 0 ? { ...g, passed: false, failedAtStep: 12 } : g,
    ),
  }
  const filler = Array.from({ length: 300 }, (_, i) =>
    makeSummary({
      agent: 'a',
      seed: i,
      faults: i % 2 ? ['silent_failure'] : [],
      outcome: i % 3 ? 'success' : 'failure',
    }),
  )
  const runs = [traced, sibling, ...filler]
  const manifest = makeManifest(
    [
      { id: 'a', design: 'react' },
      { id: traced.agent.id, design: traced.agent.agentDesign },
    ],
    {
      tasks: [
        {
          id: 'T1',
          category: 'refund',
          title: 'Test task',
          description: 'd',
          expectedOutcome: 'e',
          expectedAction: 'refund',
        },
        {
          id: 'T01',
          category: 'refund',
          title: 'Cracked enamel mug',
          description: 'd',
          expectedOutcome: 'Refund 289 NOK.',
          expectedAction: 'refund',
        },
      ],
      faultSettings: [[], [{ id: 'timeout' }], [{ id: 'silent_failure' }]],
      tracedRunIds: [traced.id],
    },
  )
  // Stable promises, as the real loaders cache theirs (use() needs the same promise each render).
  const once = <T,>(v: T) => Promise.resolve(v)
  const manifestP = once(manifest)
  const indexP = once(buildRunIndex({ manifest, runs }))
  const traceP = once(makeRun())
  const summaries = new Map(runs.map((r) => [r.id, once(r)]))
  const missing = once(null)
  return {
    ...actual,
    loadManifest: () => manifestP,
    loadRunIndex: () => indexP,
    loadTrace: () => traceP,
    loadRunSummary: (id: string) => summaries.get(id) ?? missing,
  }
})

const { routes } = await import('../routes.tsx')

beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(cleanup)

/** Awaited act(): React 19 does not retry a suspended render inside a synchronous act scope. */
async function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  await act(async () => {
    render(<RouterProvider router={router} />)
  })
  return router
}
const press = (key: string, target: Element = document.body) =>
  act(async () => void fireEvent.keyDown(target, { key }))
const summaryLine = () => screen.getByText(/runs$/, { selector: 'span' }).parentElement!.textContent

describe('run explorer', () => {
  it('applies filters from the URL, as a matrix cell link does', async () => {
    await renderAt('/runs?agent=a&fault=silent_failure')
    await screen.findByRole('table', { name: 'Runs' })
    expect(summaryLine()).toMatch(/^150 runs/)
    expect((screen.getByLabelText('Fault') as HTMLSelectElement).value).toBe('silent_failure')
  })

  it('renders only the rows near the viewport', async () => {
    await renderAt('/runs')
    const table = await screen.findByRole('table', { name: 'Runs' })
    expect(table.getAttribute('aria-rowcount')).toBe('303')
    const rendered = table.querySelectorAll('[role="row"]').length - 1
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(40)
  })

  it('updates the list and the URL when a filter changes', async () => {
    const router = await renderAt('/runs?agent=a')
    await screen.findByRole('table', { name: 'Runs' })
    await act(
      async () =>
        void fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'failure' } }),
    )
    expect(new URLSearchParams(router.state.location.search).get('outcome')).toBe('failure')
    expect(summaryLine()).toMatch(/^100 runs/)
  })

  it('can show only runs with a replay', async () => {
    await renderAt('/runs?replay=1')
    await screen.findByRole('table', { name: 'Runs' })
    expect(summaryLine()).toMatch(/^1 runs/)
    expect(screen.getByRole('link', { name: /Cracked enamel mug/ }).getAttribute('href')).toBe(
      '/runs/fixture-001',
    )
  })
})

describe('replay viewer', () => {
  it('opens at the step in the URL and shows that step and the world after it', async () => {
    await renderAt('/runs/fixture-001?step=9')
    expect(await screen.findByText('Step 9 / 12')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Current step' }).textContent).toContain(
      'refunds.issue',
    )
    const world = screen.getByRole('region', { name: 'World state after this step' })
    expect(world.textContent).toContain('R-901')
    expect(world.textContent).toContain('added')
  })

  it('steps with the arrow keys and mirrors the step into the URL', async () => {
    const router = await renderAt('/runs/fixture-001?step=9')
    await screen.findByText('Step 9 / 12')
    await press('ArrowRight')
    await press('ArrowRight')
    expect(screen.getByText('Step 11 / 12')).toBeTruthy()
    expect(router.state.location.search).toBe('?step=11')
    await press('ArrowLeft')
    expect(screen.getByText('Step 10 / 12')).toBeTruthy()
  })

  it('clamps to the trace and jumps with Home and End', async () => {
    await renderAt('/runs/fixture-001?step=999')
    expect(await screen.findByText('Step 12 / 12')).toBeTruthy()
    await press('Home')
    expect(screen.getByText('Step 0 / 12')).toBeTruthy()
  })

  it('toggles playback with the space bar', async () => {
    await renderAt('/runs/fixture-001')
    await screen.findByText('Step 0 / 12')
    await press(' ')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
    await press(' ')
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
  })

  it('marks the fault on the timeline and explains it at that step', async () => {
    await renderAt('/runs/fixture-001?step=4')
    await screen.findByText('Step 4 / 12')
    expect(
      screen.getByRole('button', {
        name: /Step 4: Tool result, orders.get, fault injected \(timeout\)/,
      }),
    ).toBeTruthy()
    expect(screen.getByText('Call held for 30 s, then failed.')).toBeTruthy()
  })

  it('shows a summary with a link to the replayable sibling for runs without a trace', async () => {
    await renderAt('/runs/fixture-002')
    expect(await screen.findByText('No step-by-step trace for this run')).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: /Replay the same agent, task and fault \(seed 1\)/ })
        .getAttribute('href'),
    ).toBe('/runs/fixture-001')
  })

  it('says so when the run does not exist', async () => {
    await renderAt('/runs/nope')
    expect(await screen.findByRole('heading', { name: 'Run not found' })).toBeTruthy()
  })
})
