import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Run, SCHEMA_VERSION, toSummary } from '../../src/schema/index.ts'
import type { DatasetManifest, RunSummary } from '../../src/schema/index.ts'
import { AGENTS, FAULT_SETTINGS, GENERATOR, RATE_LIMIT_CALLS, SEEDS } from './config.ts'
import { buildRun, sampleOutcome } from './generate-run.ts'
import { SCENARIOS, toTask } from './scenarios.ts'

/** Runs with these seeds get a full trace file; all others ship as summaries only. See shouldKeepTrace. */
export const TRACE_SEEDS: ReadonlySet<number> = new Set([1])

export const DATA_FILES = { summaries: 'runs.json', traceTemplate: 'traces/{runId}.json' }

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden')

export interface Dataset {
  manifest: DatasetManifest
  /** Every generated run with its full trace (in memory; only a sample is written). */
  runs: Run[]
  summaries: RunSummary[]
  /** Hand-written showcase runs, parsed and validated from scripts/golden/. */
  goldenRuns: Run[]
}

/** The decision of which full traces to ship, kept in one place. */
export const shouldKeepTrace = (r: Run) => TRACE_SEEDS.has(r.seed)

export function loadGoldenRuns(): Run[] {
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const parsed = Run.safeParse(JSON.parse(readFileSync(join(GOLDEN_DIR, f), 'utf8')))
      if (!parsed.success)
        throw new Error(
          `golden trace ${f} is invalid:\n${parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
        )
      return parsed.data
    })
}

/** Pure and deterministic: the same code always produces the same dataset. */
export function generateDataset(): Dataset {
  const runs: Run[] = []
  for (const agent of AGENTS)
    for (const fault of FAULT_SETTINGS)
      for (const scenario of SCENARIOS)
        for (const seed of SEEDS) {
          const outcome = sampleOutcome(agent, scenario, fault, seed)
          runs.push(buildRun({ agent, scenario, fault, seed, outcome }))
        }

  const goldenRuns = loadGoldenRuns()
  const summaries = runs.map(toSummary)
  const manifest: DatasetManifest = {
    schemaVersion: SCHEMA_VERSION,
    source: 'simulated',
    generator: GENERATOR,
    agents: AGENTS.map((a) => a.config),
    tasks: SCENARIOS.map(toTask),
    faultSettings: FAULT_SETTINGS.map((f) =>
      f === null
        ? []
        : [f === 'rate_limit' ? { id: f, params: { calls: RATE_LIMIT_CALLS } } : { id: f }],
    ),
    seeds: SEEDS,
    runCount: summaries.length,
    files: DATA_FILES,
    tracedRunIds: runs.filter(shouldKeepTrace).map((r) => r.id),
    goldenRunIds: goldenRuns.map((r) => r.id),
  }
  return { manifest, runs, summaries, goldenRuns }
}
