import { beforeAll, describe, expect, it } from 'vitest'
import { byAgent, byFaultKey, meanSteps, successRate } from '../../src/metrics/index.ts'
import { DatasetManifest, faultKey, Run, RunSummary } from '../../src/schema/index.ts'
import type { RunSummary as RunSummaryT } from '../../src/schema/index.ts'
import { generateDataset } from './dataset.ts'
import type { Dataset } from './dataset.ts'

let data: Dataset
beforeAll(() => {
  data = generateDataset()
})

const rate = (runs: RunSummaryT[]) => successRate(runs)!.rate
const withFault = (runs: RunSummaryT[], key: string) =>
  runs.filter((r) => faultKey(r.faults) === key)

describe('generated data validates against the schema', () => {
  it('every full run is a valid Run (including diff replay and grader consistency)', () => {
    const bad = data.runs
      .map((r) => [r.id, Run.safeParse(r)] as const)
      .filter(([, p]) => !p.success)
    expect(bad.map(([id, p]) => `${id}: ${p.error?.issues[0]?.message}`)).toEqual([])
    // Parsing all 7,200 full runs takes several seconds since zod runs jitless (the site's
    // CSP forbids eval), more than the default 5 s while the whole suite runs in parallel.
  }, 30_000)

  it('every summary is a valid RunSummary, and the manifest is valid', () => {
    expect(data.summaries.filter((s) => !RunSummary.safeParse(s).success)).toEqual([])
    const m = DatasetManifest.safeParse(data.manifest)
    expect(m.error?.issues ?? []).toEqual([])
  })

  it('has the planned scale: 9 agents × 8 fault settings × 20 tasks × 5 seeds', () => {
    expect(data.summaries).toHaveLength(9 * 8 * 20 * 5)
    expect(new Set(data.summaries.map((s) => s.id)).size).toBe(data.summaries.length)
  })
})

describe('determinism', () => {
  it('generating twice gives identical output', () => {
    const again = generateDataset()
    expect(JSON.stringify(again.manifest)).toBe(JSON.stringify(data.manifest))
    expect(JSON.stringify(again.runs)).toBe(JSON.stringify(data.runs))
  })
})

describe('honesty rule', () => {
  it('uses placeholder model labels only', () => {
    for (const a of data.manifest.agents) expect(a.modelLabel).toMatch(/^Model [A-Z] \(/)
  })

  it('contains no real model or vendor names anywhere', () => {
    const text = JSON.stringify([data.manifest, data.runs, data.goldenRuns]).toLowerCase()
    const banned =
      /\b(gpt|claude|llama|qwen|gemini|mistral|mixtral|deepseek|phi-\d|gemma|openai|anthropic|grok)\b/
    expect(text.match(banned)?.[0] ?? null).toBeNull()
  })

  it('marks the dataset as simulated', () => {
    expect(data.manifest.source).toBe('simulated')
  })
})

describe('believable, not random (HANDOFF §6)', () => {
  it('baseline success is fairly high: 70–90% pooled', () => {
    const baseline = rate(withFault(data.summaries, 'none'))
    expect(baseline).toBeGreaterThanOrEqual(0.7)
    expect(baseline).toBeLessThanOrEqual(0.9)
  })

  it('every fault lowers pooled success compared with baseline', () => {
    const baseline = rate(withFault(data.summaries, 'none'))
    for (const [key, runs] of byFaultKey(data.summaries))
      if (key !== 'none') expect(rate(runs), key).toBeLessThan(baseline)
  })

  it('prompt injection mostly produces unsafe outcomes rather than plain failures', () => {
    const failed = withFault(data.summaries, 'prompt_injection').filter(
      (r) => r.outcome !== 'success',
    )
    const unsafe = failed.filter((r) => r.outcome === 'unsafe').length
    expect(unsafe / failed.length).toBeGreaterThan(0.5)
  })

  it('the verifier design is noticeably better on silent failure', () => {
    const silent = withFault(data.summaries, 'silent_failure')
    const verifier = rate(silent.filter((r) => r.agent.agentDesign === 'react_with_verifier'))
    const react = rate(silent.filter((r) => r.agent.agentDesign === 'react'))
    expect(verifier - react).toBeGreaterThan(0.15)
  })

  it('confidence intervals have visible width per matrix cell', () => {
    const widths = [...byAgent(data.summaries).values()].flatMap((runs) =>
      [...byFaultKey(runs).values()].map((cell) => {
        const w = successRate(cell)!
        return w.upper - w.lower
      }),
    )
    const mean = widths.reduce((s, w) => s + w, 0) / widths.length
    expect(mean).toBeGreaterThan(0.08)
  })

  it('failed runs take more steps than successful ones', () => {
    const ok = data.summaries.filter((r) => r.outcome === 'success')
    const notOk = data.summaries.filter((r) => r.outcome !== 'success')
    expect(meanSteps(notOk)!).toBeGreaterThan(meanSteps(ok)!)
  })
})

describe('trace sampling and golden traces', () => {
  it('ships one replayable trace per agent × fault × task cell', () => {
    const traced = new Set(data.manifest.tracedRunIds)
    const cells = new Map<string, number>()
    for (const s of data.summaries)
      if (traced.has(s.id)) {
        const cell = `${s.agent.id}|${faultKey(s.faults)}|${s.taskId}`
        cells.set(cell, (cells.get(cell) ?? 0) + 1)
      }
    expect(cells.size).toBe(9 * 8 * 20)
    expect([...cells.values()].every((n) => n === 1)).toBe(true)
  })

  it('keeps golden traces out of the summaries (and so out of every metric)', () => {
    const ids = new Set(data.summaries.map((s) => s.id))
    expect(data.manifest.goldenRunIds).toHaveLength(3)
    for (const g of data.manifest.goldenRunIds) expect(ids.has(g)).toBe(false)
  })

  it('golden 1: falls for prompt injection and refunds the wrong order', () => {
    const g = data.goldenRuns.find((r) => r.id === 'g-injection')!
    expect(g.outcome).toBe('unsafe')
    expect(g.graders.find((x) => x.graderId === 'injection_resisted')?.passed).toBe(false)
    expect(
      g.steps.some(
        (s) =>
          s.type === 'tool_result' && s.worldDiff?.some((d) => d.path === '/orders/4411/status'),
      ),
    ).toBe(true)
  })

  it('golden 2: notices a silent failure, re-checks and recovers', () => {
    const g = data.goldenRuns.find((r) => r.id === 'g-silent')!
    expect(g.outcome).toBe('success')
    const silent = g.steps.findIndex(
      (s) => s.type === 'tool_result' && s.injectedFault?.id === 'silent_failure',
    )
    expect(silent).toBeGreaterThan(0)
    const refundsAfter = g.steps
      .slice(silent + 1)
      .filter((s) => s.type === 'tool_result' && s.tool === 'refunds.issue' && s.worldDiff)
    expect(refundsAfter).toHaveLength(1)
  })

  it('golden 3: hits stale data vs the carrier and escalates', () => {
    const g = data.goldenRuns.find((r) => r.id === 'g-stale')!
    expect(g.outcome).toBe('success')
    expect(g.escalated).toBe(true)
    expect(
      g.steps.some((s) => s.type === 'tool_result' && s.injectedFault?.id === 'stale_data'),
    ).toBe(true)
  })
})
