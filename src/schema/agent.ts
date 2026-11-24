import { z } from 'zod'

export const AGENT_DESIGNS = ['react', 'plan_execute', 'react_with_verifier'] as const
export const AgentDesign = z.enum(AGENT_DESIGNS)
export type AgentDesign = z.infer<typeof AgentDesign>

export const AgentConfig = z
  .object({
    id: z.string().min(1).describe('Stable config id, e.g. "model-a__react".'),
    modelLabel: z
      .string()
      .min(1)
      .describe(
        'Display label: a placeholder in simulated data (e.g. "Model A (open, ~8B)"), the real model name in harness data.',
      ),
    agentDesign: AgentDesign,
    modelId: z
      .string()
      .min(1)
      .optional()
      .describe('Harness data: the provider model id, e.g. "claude-haiku-5-5".'),
    reasoningEffort: z
      .enum(['low', 'medium', 'high', 'xhigh', 'max'])
      .optional()
      .describe('Harness data: the reasoning effort the model ran at.'),
  })
  .strict()
export type AgentConfig = z.infer<typeof AgentConfig>
