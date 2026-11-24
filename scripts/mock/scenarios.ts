import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ScenarioCatalog } from '../../src/schema/index.ts'
import type { Scenario, Task } from '../../src/schema/index.ts'

export type { CustomerSeed, OrderSeed, Scenario } from '../../src/schema/index.ts'

/**
 * The 20 tasks for Nordlys Supply (a fictional shop) live in the shared catalog
 * `scenarios/catalog.json`, which the Python harness reads too. The `Task`
 * fields go into the manifest; the rest feeds the world and the graders.
 */
const CATALOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'scenarios',
  'catalog.json',
)

export function loadCatalog(): ScenarioCatalog {
  return ScenarioCatalog.parse(JSON.parse(readFileSync(CATALOG_PATH, 'utf8')))
}

export const CATALOG = loadCatalog()
export const SCENARIOS: Scenario[] = CATALOG.scenarios

export function toTask(s: Scenario): Task {
  return {
    id: s.id,
    category: s.category,
    title: s.title,
    description: s.description,
    expectedOutcome: s.expectedOutcome,
    expectedAction: s.expectedAction,
  }
}
