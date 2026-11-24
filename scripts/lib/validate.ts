import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { DatasetManifest, Run, RunSummary, toSummary } from '../../src/schema/index.ts'

interface Issues {
  success: boolean
  error?: { issues: { path: PropertyKey[]; message: string }[] }
}

/** The parts of a dataset, already in memory. Traces are keyed by run id. */
export interface DatasetParts {
  manifest: unknown
  summaries: unknown[]
  traces: Map<string, unknown>
}

/**
 * Checks a dataset against the contract: the manifest, every summary and trace
 * against the zod schemas (all 15 rules), plus the rules that span files. Returns
 * human-readable problems; an empty list means the dataset is valid.
 */
export function checkDataset({ manifest, summaries, traces }: DatasetParts): string[] {
  const problems: string[] = []
  const report = (label: string, r: Issues) => {
    if (!r.success)
      for (const i of r.error!.issues.slice(0, 5))
        problems.push(`${label} ${i.path.join('.')}: ${i.message}`)
  }

  const m = DatasetManifest.safeParse(manifest)
  report('manifest', m)
  const parsedTraces = new Map<string, Run>()
  for (const [id, t] of traces) {
    const r = Run.safeParse(t)
    report(`trace ${id}`, r)
    if (r.success) parsedTraces.set(id, r.data)
  }
  for (const s of summaries) {
    const r = RunSummary.safeParse(s)
    const id = (s as { id?: string }).id ?? '?'
    report(`summary ${id}`, r)
    const trace = parsedTraces.get(id)
    if (r.success && trace && !isDeepStrictEqual(toSummary(trace), r.data))
      problems.push(`summary ${id} does not match its trace`)
  }
  if (!m.success) return problems

  const { runCount, tracedRunIds, goldenRunIds, featuredRunIds = [] } = m.data
  if (runCount !== summaries.length)
    problems.push(`manifest runCount is ${runCount}, but there are ${summaries.length} summaries`)
  const summaryIds = new Set(summaries.map((s) => (s as { id?: string }).id))
  for (const id of tracedRunIds) {
    if (!traces.has(id)) problems.push(`traced run ${id} has no trace file`)
    if (!summaryIds.has(id)) problems.push(`traced run ${id} has no summary`)
  }
  for (const id of goldenRunIds)
    if (!traces.has(id)) problems.push(`golden run ${id} has no trace file`)
  for (const id of featuredRunIds)
    if (!traces.has(id)) problems.push(`featured run ${id} has no trace file`)
  return problems
}

/** Reads a dataset folder (manifest.json, the summaries file and the trace files it names) and checks it. */
export function validateDataset(dir: string): string[] {
  const read = (rel: string): unknown => JSON.parse(readFileSync(join(dir, rel), 'utf8'))
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) return [`${manifestPath} not found`]
  const manifest = read('manifest.json')
  const m = DatasetManifest.safeParse(manifest)
  const files = m.success
    ? m.data.files
    : { summaries: 'runs.json', traceTemplate: 'traces/{runId}.json' }
  const summaries = read(files.summaries)
  if (!Array.isArray(summaries)) return [`${files.summaries} is not an array`]
  const ids = m.success
    ? [...m.data.tracedRunIds, ...m.data.goldenRunIds, ...(m.data.featuredRunIds ?? [])]
    : []
  const traces = new Map<string, unknown>()
  for (const id of new Set(ids)) {
    const rel = files.traceTemplate.replace('{runId}', id)
    if (existsSync(join(dir, rel))) traces.set(id, read(rel))
  }
  return checkDataset({ manifest, summaries, traces })
}
