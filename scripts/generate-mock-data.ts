/**
 * Generates the simulated dataset into public/data/:
 *   manifest.json        DatasetManifest
 *   runs.json            RunSummary[] for every generated run (all metrics use this)
 *   traces/<runId>.json  full Run for a sample of runs plus the golden traces
 *
 * Everything is validated against the zod schemas before anything is written.
 * Output is deterministic: running this twice produces identical files.
 */
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatasetManifest, Run, RunSummary } from '../src/schema/index.ts'
import { DATA_FILES, generateDataset, shouldKeepTrace } from './mock/dataset.ts'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')

const started = performance.now()
const { manifest, runs, summaries, goldenRuns } = generateDataset()

// Validate everything first, so a bad dataset never reaches the site.
const problems: string[] = []
const check = (
  label: string,
  result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
) => {
  if (!result.success)
    for (const i of result.error!.issues.slice(0, 5))
      problems.push(`${label} ${i.path.join('.')}: ${i.message}`)
}
for (const r of runs) check(r.id, Run.safeParse(r))
for (const s of summaries) check(`${s.id} (summary)`, RunSummary.safeParse(s))
check('manifest', DatasetManifest.safeParse(manifest))
if (problems.length) {
  console.error(
    `Generated data failed validation (${problems.length} problems):\n${problems.slice(0, 30).join('\n')}`,
  )
  process.exit(1)
}

// Compact JSON: these files are fetched by the browser, not read by people.
rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, 'traces'), { recursive: true })
const write = (rel: string, data: unknown) => {
  const path = join(outDir, rel)
  writeFileSync(path, JSON.stringify(data))
  return statSync(path).size
}
write('manifest.json', manifest)
const summaryBytes = write(DATA_FILES.summaries, summaries)
let traceBytes = 0
let traceCount = 0
for (const r of [...runs.filter(shouldKeepTrace), ...goldenRuns]) {
  traceBytes += write(DATA_FILES.traceTemplate.replace('{runId}', r.id), r)
  traceCount++
}

const mb = (b: number) => (b / 1024 / 1024).toFixed(2) + ' MB'
console.log(
  `Generated ${runs.length} runs + ${goldenRuns.length} golden traces in ${((performance.now() - started) / 1000).toFixed(1)} s`,
)
console.log(`  runs.json      ${mb(summaryBytes)} (${summaries.length} summaries)`)
console.log(
  `  traces/        ${mb(traceBytes)} (${traceCount} files, avg ${(traceBytes / traceCount / 1024).toFixed(1)} KB)`,
)
console.log(`  total          ${mb(summaryBytes + traceBytes)}`)
