/**
 * Checks a dataset folder against the Squall contract before it is published:
 *   npm run validate:dataset -- datasets/haiku-trial
 * Exits 0 and prints a one-line summary when valid; otherwise prints up to 30
 * problems and exits 1.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateDataset } from './lib/validate.ts'

const dir = process.argv[2]
if (!dir) {
  console.error('Usage: npm run validate:dataset -- <dataset folder>')
  process.exit(2)
}
const problems = validateDataset(dir)
if (problems.length) {
  console.error(
    `${dir} is invalid (${problems.length} problems):\n${problems.slice(0, 30).join('\n')}`,
  )
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
const traces = new Set([...manifest.tracedRunIds, ...manifest.goldenRunIds]).size
console.log(`OK: ${manifest.runCount} runs, ${traces} traces`)
