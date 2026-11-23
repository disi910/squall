import { z } from 'zod'
import { FaultId } from './faults.ts'
import { ToolName } from './tools.ts'
import { WorldChange } from './world.ts'

/**
 * A trace step is a discriminated union on `type`, not one object with many
 * optional fields. Each variant states exactly which fields it has, so a
 * tool_call without `args` fails validation and the replay viewer gets exact
 * TypeScript narrowing.
 *
 * The brief's `fault_injected` step type is gone: every fault reaches the agent
 * through a tool response (an error, a bad body, a stale value, an injected
 * email, a fake success), so it is recorded as `injectedFault` on that
 * tool_result. The agent's own stream stays free of harness metadata.
 */

const StepBase = {
  index: z.int().nonnegative().describe('Position in the steps array.'),
  tMs: z.int().nonnegative().describe('Milliseconds since run start.'),
}

export const Tokens = z
  .object({ input: z.int().nonnegative(), output: z.int().nonnegative() })
  .strict()
  .describe('Tokens used by the LLM call that produced this step.')
export type Tokens = z.infer<typeof Tokens>

export const InjectedFault = z
  .object({
    id: FaultId,
    note: z.string().describe('Human-readable description of what the fault layer did.'),
    excerpt: z
      .string()
      .optional()
      .describe('Exact substring of the result to highlight, e.g. the injected instruction.'),
  })
  .strict()
  .describe('Harness annotation: this result was altered by the fault layer. Not visible to the agent.')
export type InjectedFault = z.infer<typeof InjectedFault>

export const TOOL_ERROR_KINDS = ['timeout', 'rate_limited', 'invalid_response', 'other'] as const
export const ToolError = z
  .object({ kind: z.enum(TOOL_ERROR_KINDS), message: z.string() })
  .strict()
export type ToolError = z.infer<typeof ToolError>

export const ObservationStep = z
  .object({ ...StepBase, type: z.literal('observation'), content: z.string() })
  .strict()
  .describe('Input given to the agent outside a tool call, e.g. the initial instructions.')

export const ReasoningStep = z
  .object({ ...StepBase, type: z.literal('reasoning'), content: z.string(), tokens: Tokens.optional() })
  .strict()

export const ToolCallStep = z
  .object({
    ...StepBase,
    type: z.literal('tool_call'),
    callId: z.string().min(1).describe('Unique within the run; pairs the call with its result.'),
    tool: ToolName,
    args: z.record(z.string(), z.unknown()),
    tokens: Tokens.optional(),
  })
  .strict()

export const ToolResultStep = z
  .object({
    ...StepBase,
    type: z.literal('tool_result'),
    callId: z.string().min(1),
    tool: ToolName,
    ok: z.boolean().describe('False when the tool returned an error; then `error` is set.'),
    result: z.unknown().optional().describe('Raw payload. A string when the body was not valid JSON.'),
    error: ToolError.optional(),
    injectedFault: InjectedFault.optional(),
    worldDiff: z.array(WorldChange).optional().describe('World changes caused by this call.'),
  })
  .strict()

export const FinalAnswerStep = z
  .object({ ...StepBase, type: z.literal('final_answer'), content: z.string(), tokens: Tokens.optional() })
  .strict()

export const Step = z.discriminatedUnion('type', [
  ObservationStep,
  ReasoningStep,
  ToolCallStep,
  ToolResultStep,
  FinalAnswerStep,
])
export type Step = z.infer<typeof Step>
export type StepType = Step['type']
export type ToolCallStep = z.infer<typeof ToolCallStep>
export type ToolResultStep = z.infer<typeof ToolResultStep>
