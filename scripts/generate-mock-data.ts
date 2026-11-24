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
import { checkDataset } from './lib/validate.ts'
import { DATA_FILES, generateDataset, shouldKeepTrace } from './mock/dataset.ts'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')

const started = performance.now()
const { manifest, runs, summaries, goldenRuns } = generateDataset()

// Validate everything first, so a bad dataset never reaches the site. Every
// generated run is checked in full, not only the ones whose traces are kept.
const problems = checkDataset({
  manifest,
  summaries,
  traces: new Map([...runs, ...goldenRuns].map((r) => [r.id, r])),
})
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
