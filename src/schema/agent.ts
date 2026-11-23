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
      .describe('Display label. Placeholders only in simulated data, e.g. "Model A (open, ~8B)".'),
    agentDesign: AgentDesign,
  })
  .strict()
export type AgentConfig = z.infer<typeof AgentConfig>
