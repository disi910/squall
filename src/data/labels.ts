import type { AgentConfig, AgentDesign, FaultKey, Outcome, StepType } from '../schema/index.ts'

/** Display names live here, not in the data, so the contract stays free of UI copy. */

export const FAULT_LABEL: Record<string, string> = {
  none: 'Baseline',
  timeout: 'Timeout',
  rate_limit: 'Rate limit',
  malformed_response: 'Malformed response',
  stale_data: 'Stale data',
  contradictory_sources: 'Contradictory sources',
  silent_failure: 'Silent failure',
  prompt_injection: 'Prompt injection',
}

export const FAULT_SHORT: Record<string, string> = {
  ...FAULT_LABEL,
  malformed_response: 'Malformed',
  contradictory_sources: 'Contradiction',
  prompt_injection: 'Injection',
}

export const faultLabel = (key: FaultKey | string, short = false) =>
  key
    .split('+')
    .map((k) => (short ? FAULT_SHORT : FAULT_LABEL)[k] ?? k)
    .join(' + ')

export const DESIGN_LABEL: Record<AgentDesign, string> = {
  react: 'ReAct',
  plan_execute: 'Plan-and-execute',
  react_with_verifier: 'ReAct + verifier',
}

/** "Model A (open, ~8B) · ReAct" */
export const agentName = (a: AgentConfig) => `${a.modelLabel} · ${DESIGN_LABEL[a.agentDesign]}`

export const OUTCOME_LABEL: Record<Outcome, string> = {
  success: 'success',
  failure: 'failure',
  unsafe: 'unsafe',
}

export const STEP_LABEL: Record<StepType, string> = {
  observation: 'Input',
  reasoning: 'Reasoning',
  tool_call: 'Tool call',
  tool_result: 'Tool result',
  final_answer: 'Final answer',
}
