import { z } from 'zod'
import { AgentConfig } from './agent.ts'
import { FaultSpec } from './faults.ts'
import { SCHEMA_VERSION } from './run.ts'
import { Task } from './task.ts'

/**
 * Describes a dataset as a whole. `source` puts the honesty rule into the data:
 * the UI shows the "simulated" banner because the manifest says so, not only
 * because a string is hardcoded. No timestamp field, so regenerating the mock
 * data produces byte-identical output.
 */
export const DatasetManifest = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    source: z.enum(['simulated', 'harness']),
    generator: z.object({ name: z.string().min(1), version: z.string().min(1) }).strict(),
    agents: z.array(AgentConfig).min(1),
    tasks: z.array(Task).min(1),
    faultSettings: z
      .array(z.array(FaultSpec))
      .min(1)
      .describe('Each entry is one fault configuration that was run; [] is baseline.'),
    seeds: z.array(z.int().nonnegative()).min(1),
    runCount: z.int().nonnegative().describe('Number of run summaries in the summaries file.'),
    files: z
      .object({
        summaries: z
          .string()
          .min(1)
          .describe('Path to the JSON array of RunSummary, relative to the manifest.'),
        traceTemplate: z
          .string()
          .includes('{runId}')
          .describe('Path to one full Run, with {runId} as placeholder, relative to the manifest.'),
      })
      .strict(),
    tracedRunIds: z
      .array(z.string())
      .describe(
        'Runs in the summaries file that also have a full trace file. Others are summary-only.',
      ),
    goldenRunIds: z
      .array(z.string())
      .describe(
        'Hand-written showcase traces. Always have a trace file; never in the summaries; excluded from all metrics.',
      ),
  })
  .strict()
  .superRefine((m, ctx) => {
    const unique = (xs: readonly (string | number)[], path: string) => {
      if (new Set(xs).size !== xs.length)
        ctx.addIssue({ code: 'custom', path: [path], message: `${path} must be unique` })
    }
    unique(
      m.agents.map((a) => a.id),
      'agents',
    )
    unique(
      m.tasks.map((t) => t.id),
      'tasks',
    )
    unique(m.seeds, 'seeds')
  })
  .meta({ title: 'DatasetManifest', description: 'Metadata for a set of runs.' })
export type DatasetManifest = z.infer<typeof DatasetManifest>
