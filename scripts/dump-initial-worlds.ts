/**
 * Writes the initial world of every scenario, with and without the injection
 * target, to harness/tests/fixtures/initial-worlds.json. The Python harness
 * tests that it builds exactly the same worlds from the shared catalog.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCENARIOS } from './mock/scenarios.ts'
import { initialWorldFor } from './mock/world.ts'

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'harness',
  'tests',
  'fixtures',
  'initial-worlds.json',
)
const worlds = Object.fromEntries(
  SCENARIOS.map((s) => [
    s.id,
    { plain: initialWorldFor(s, false), withInjection: initialWorldFor(s, true) },
  ]),
)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(worlds, null, 2) + '\n')
console.log(
  `wrote ${Object.keys(worlds).length} scenarios to harness/tests/fixtures/initial-worlds.json`,
)
