// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { REPORT_SECTIONS, slug } from '../content/report-sections.ts'
import type { RunSummary } from '../schema/index.ts'

// One task, two agents: baseline 3/4 success; under faults 2/4; one unsafe injection run.
vi.mock('../data/load.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/load.ts')>()
  const { computeAnalysis } = await import('../data/analysis.ts')
  const { makeManifest, makeSummary } = await import('../test/fixtures/summaries.ts')
  const manifest = makeManifest([
    { id: 'a', design: 'react' },
    { id: 'v', design: 'react_with_verifier' },
  ])
  const v = { agent: 'v', design: 'react_with_verifier' as const }
  const runs: RunSummary[] = [
    makeSummary({ agent: 'a', seed: 1 }),
    makeSummary({ agent: 'a', seed: 2, outcome: 'failure' }),
    makeSummary({ ...v, seed: 1 }),
    makeSummary({ ...v, seed: 2 }),
    makeSummary({ agent: 'a', seed: 1, faults: ['silent_failure'], outcome: 'failure' }),
    makeSummary({ ...v, seed: 1, faults: ['silent_failure'] }),
    makeSummary({
      agent: 'a',
      seed: 1,
      faults: ['prompt_injection'],
      outcome: 'unsafe',
      followedInjection: true,
    }),
    makeSummary({ ...v, seed: 1, faults: ['prompt_injection'] }),
  ]
  const analysis = Promise.resolve(computeAnalysis({ manifest, runs }))
  const manifestP = Promise.resolve(manifest)
  return { ...actual, loadAnalysis: () => analysis, loadManifest: () => manifestP }
})

const { routes } = await import('../routes.tsx')

beforeAll(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(cleanup)

async function renderAt(path: string) {
  await act(async () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />)
  })
}

describe('tasks page', () => {
  it('lists tasks by category with their criterion and rates with intervals', async () => {
    await renderAt('/tasks')
    expect(await screen.findByRole('heading', { name: 'Refund, straightforward' })).toBeTruthy()
    const card = screen.getByRole('heading', { name: 'Test task' }).closest('article')!
    expect(within(card).getByText(/Success criterion/).parentElement!.textContent).toContain('e')
    expect(within(card).getByText('expected: refund')).toBeTruthy()
    // Baseline 3/4 → 75%, Wilson interval 30–95.
    expect(within(card).getByText('[30–95] n=4')).toBeTruthy()
    expect(within(card).getByRole('link', { name: '8 runs →' }).getAttribute('href')).toBe(
      '/runs?task=T1',
    )
  })
})

describe('report page', () => {
  it('has a table of contents whose links all point at headings', async () => {
    await renderAt('/report')
    await screen.findByRole('heading', { name: 'Methodology' })
    for (const section of REPORT_SECTIONS) {
      const link = screen.getByRole('link', { name: section })
      expect(link.getAttribute('href')).toBe(`#${slug(section)}`)
      expect(document.getElementById(slug(section))?.tagName).toBe('H2')
    }
  })

  it('fills its example findings with live numbers and intervals', async () => {
    await renderAt('/report')
    const findings = await screen.findAllByText(/^Example finding \d$/)
    expect(findings).toHaveLength(3)
    // Pooled baseline over both agents: 3/4.
    const first = findings[0]!.parentElement!
    await vi.waitFor(() => expect(first.textContent).toContain('75% (95% CI 30–95)'))
    expect(screen.getByText(/findings below are/).textContent).toContain('hypothetical')
  })
})
