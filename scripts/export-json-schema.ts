/**
 * Writes the JSON Schema contract to schema/*.schema.json from the zod
 * schemas in src/schema. Run with `npm run schema:export` after changing a
 * schema; a test fails if the committed files fall out of date.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildJsonSchemas, serializeJsonSchema } from '../src/schema/json-schema.ts'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema')
mkdirSync(outDir, { recursive: true })

for (const [file, doc] of Object.entries(buildJsonSchemas())) {
  writeFileSync(join(outDir, file), serializeJsonSchema(doc))
  console.log(`wrote schema/${file}`)
}
