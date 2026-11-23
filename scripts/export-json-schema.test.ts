import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { buildJsonSchemas, serializeJsonSchema } from '../src/schema/json-schema.ts'
import { toSummary } from '../src/schema/run.ts'
import { makeRun } from '../src/test/fixtures/minimal-run.ts'

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema')

// Drift guard: the committed JSON Schema is the contract the Python harness
// reads. If a zod schema changes without re-exporting, this fails.
describe('committed JSON Schema', () => {
  for (const [file, doc] of Object.entries(buildJsonSchemas())) {
    it(`schema/${file} is up to date (run npm run schema:export)`, () => {
      const path = join(schemaDir, file)
      expect(existsSync(path), `missing ${path}`).toBe(true)
      expect(readFileSync(path, 'utf8')).toBe(serializeJsonSchema(doc))
    })
  }
})

// Contract check with an independent validator, the way the Python side will
// use it: the exported files must accept a real trace and reject broken ones.
describe('exported JSON Schema with Ajv', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  // ajv-formats is CommonJS; require() hands back the plugin function directly.
  const addFormats = createRequire(import.meta.url)(
    'ajv-formats',
  ) as typeof import('ajv-formats').default
  addFormats(ajv)
  const schemas = buildJsonSchemas()
  const validateRun = ajv.compile(schemas['run.schema.json'] as object)
  const validateSummary = ajv.compile(schemas['run-summary.schema.json'] as object)

  it('accepts the fixture run and its summary', () => {
    expect(validateRun(makeRun()), JSON.stringify(validateRun.errors)).toBe(true)
    expect(validateSummary(toSummary(makeRun())), JSON.stringify(validateSummary.errors)).toBe(true)
  })

  it('rejects structural errors (unknown tool, bad step shape)', () => {
    const run = makeRun() as unknown as { steps: Record<string, unknown>[] }
    run.steps[1]!.tool = 'order.get'
    expect(validateRun(run)).toBe(false)
  })
})
