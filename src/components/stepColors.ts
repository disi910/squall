import type { Step } from '../schema/index.ts'

/** Tailwind background class per step type, shared by the timeline and the mini strips. */
export const STEP_BG: Record<Step['type'], string> = {
  observation: 'bg-step-observation',
  reasoning: 'bg-step-reasoning',
  tool_call: 'bg-step-call',
  tool_result: 'bg-step-result',
  final_answer: 'bg-step-final',
}
