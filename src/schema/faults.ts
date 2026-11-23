import { z } from 'zod'
import { ToolName } from './tools.ts'

/**
 * Injectable faults (HANDOFF §4). The brief's `'none'` is deliberately not a
 * FaultId: a baseline run is a run with an empty `faults` array. Keeping
 * `'none'` in the enum would make `['none', 'timeout']` a valid but
 * meaningless value.
 */
export const FAULT_IDS = [
  'timeout',
  'rate_limit',
  'malformed_response',
  'stale_data',
  'contradictory_sources',
  'silent_failure',
  'prompt_injection',
] as const

export const FaultId = z.enum(FAULT_IDS).describe('An injectable fault type.')
export type FaultId = z.infer<typeof FaultId>

/**
 * One configured fault for a run. `params` holds fault-specific knobs
 * (e.g. `{ calls: 3 }` for rate_limit); `targetTool` pins the fault to one tool
 * when the harness supports it. The seed decides the rest.
 */
export const FaultSpec = z
  .object({
    id: FaultId,
    targetTool: ToolName.optional().describe('Tool the fault is pinned to, if any.'),
    params: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe('Fault-specific parameters, e.g. { "calls": 3 } for rate_limit.'),
  })
  .strict()
export type FaultSpec = z.infer<typeof FaultSpec>

export { faultKey } from './helpers.ts'
export type { FaultKey } from './helpers.ts'
