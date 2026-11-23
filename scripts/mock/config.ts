import { AGENT_DESIGNS, FAULT_IDS } from '../../src/schema/index.ts'
import type { AgentConfig, AgentDesign, FaultId, TaskCategory } from '../../src/schema/index.ts'

/**
 * The knobs that make the simulated results believable (HANDOFF §6): high
 * baseline success, different sensitivity per fault, model and design, and
 * enough seed-level noise that confidence intervals have visible width.
 * Placeholder model names only.
 */

export interface ModelSpec {
  id: 'a' | 'b' | 'c'
  label: string
  /** Baseline success probability before task and design adjustments. */
  base: number
  /** Multiplier on every fault penalty: smaller models are hit harder. */
  sensitivity: number
}

export const MODELS: ModelSpec[] = [
  { id: 'a', label: 'Model A (open, ~8B)', base: 0.75, sensitivity: 1.3 },
  { id: 'b', label: 'Model B (open, ~70B)', base: 0.84, sensitivity: 1.0 },
  { id: 'c', label: 'Model C (API)', base: 0.89, sensitivity: 0.78 },
]

export const DESIGN_BONUS: Record<AgentDesign, number> = {
  react: 0,
  plan_execute: 0.02,
  react_with_verifier: 0.03,
}

/** How much each fault lowers success probability, before model and design scaling. */
export const FAULT_PENALTY: Record<FaultId, number> = {
  timeout: 0.1,
  rate_limit: 0.06,
  malformed_response: 0.16,
  stale_data: 0.22,
  contradictory_sources: 0.25,
  silent_failure: 0.3,
  prompt_injection: 0.36,
}

/** Per design, a factor on a fault's penalty (1 = no help). The verifier is much better on silent failures. */
export const DESIGN_FAULT_DAMPING: Record<AgentDesign, Partial<Record<FaultId, number>>> = {
  react: {},
  plan_execute: { timeout: 0.8, rate_limit: 0.75, malformed_response: 0.9, prompt_injection: 0.92 },
  react_with_verifier: {
    silent_failure: 0.28,
    stale_data: 0.6,
    contradictory_sources: 0.62,
    malformed_response: 0.7,
    prompt_injection: 0.82,
  },
}

export const CATEGORY_OFFSET: Record<TaskCategory, number> = {
  refund: 0.04,
  refund_edge: -0.04,
  status: 0,
  identity: -0.08,
  escalation: 0.02,
}

export const SEEDS = [1, 2, 3, 4, 5]

/** Fault settings in matrix order; null is the baseline (no fault). */
export const FAULT_SETTINGS: (FaultId | null)[] = [null, ...FAULT_IDS]

/** Rate-limit faults return 429 for this many calls in a row. */
export const RATE_LIMIT_CALLS = 3

export interface AgentSpec {
  config: AgentConfig
  model: ModelSpec
  design: AgentDesign
}

export const AGENTS: AgentSpec[] = MODELS.flatMap((model) =>
  AGENT_DESIGNS.map((design) => ({
    config: { id: `model-${model.id}__${design}`, modelLabel: model.label, agentDesign: design },
    model,
    design,
  })),
)

export const GENERATOR = { name: 'squall-mock', version: '0.1.0' }
