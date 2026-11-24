import type {
  AgentConfig,
  AgentDesign,
  ExpectedAction,
  FaultKey,
  Outcome,
  StepType,
  TaskCategory,
} from '../schema/index.ts'

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

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  refund: 'Refund, straightforward',
  refund_edge: 'Refund, policy edge',
  status: 'Where is my order',
  identity: 'Ambiguous identity',
  escalation: 'Should escalate',
}

export const EXPECTED_ACTION_LABEL: Record<ExpectedAction, string> = {
  refund: 'refund',
  decline: 'decline, no refund',
  reply: 'reply only',
  escalate: 'escalate to a human',
}

/**
 * Splits a label into at most two lines of about `max` characters at spaces, for the
 * matrix's narrow model column ("Claude Haiku 5.5" -> "Claude Haiku", "5.5").
 */
export function wrapLabel(label: string, max = 12): string[] {
  if (label.length <= max || !label.includes(' ')) return [label]
  const words = label.split(' ')
  let first = words[0]!
  let i = 1
  while (i < words.length && `${first} ${words[i]}`.length <= max) first = `${first} ${words[i++]}`
  return [first, words.slice(i).join(' ')]
}
