import { z } from 'zod'
import { DatasetManifest } from './manifest.ts'
import { Run, RunSummary } from './run.ts'
import { Task } from './task.ts'

const BASE_ID = 'https://squall.dev/schema/'

const DOCUMENTS = {
  run: Run,
  'run-summary': RunSummary,
  task: Task,
  manifest: DatasetManifest,
} as const

/**
 * Builds the JSON Schema files from the zod schemas, so the zod code stays the
 * single source of truth. Note: zod refinements (outcome vs graders, call
 * pairing, diff replay, ...) cannot be expressed in JSON Schema and are
 * dropped here; schema/README.md lists them for the Python side.
 */
export function buildJsonSchemas(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, schema] of Object.entries(DOCUMENTS)) {
    out[`${name}.schema.json`] = {
      $id: `${BASE_ID}${name}.schema.json`,
      ...z.toJSONSchema(schema, { target: 'draft-2020-12' }),
    }
  }
  return out
}

/** Stable text form: two-space indent and a trailing newline, so regenerating gives a clean git diff. */
export const serializeJsonSchema = (doc: unknown): string => JSON.stringify(doc, null, 2) + '\n'
