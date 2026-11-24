/**
 * Copies a committed dataset into public/data/ for the site to serve:
 *   node scripts/copy-dataset.mjs datasets/haiku-trial
 * Only what the site reads is copied (manifest, summaries, traces); the raw
 * Inspect logs and review notes stay in the repository. Validation runs in CI
 * (npm run validate:dataset), not here.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const src = process.argv[2]
if (!src || !existsSync(join(src, 'manifest.json'))) {
  console.error('Usage: node scripts/copy-dataset.mjs <dataset folder with a manifest.json>')
  process.exit(2)
}
const out = 'public/data'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const entry of ['manifest.json', 'runs.json', 'traces'])
  cpSync(join(src, entry), join(out, entry), { recursive: true })
console.log(`Copied ${src} to ${out}`)
