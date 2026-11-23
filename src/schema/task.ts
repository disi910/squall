import { z } from 'zod'

export const TASK_CATEGORIES = [
  'refund',
  'refund_edge',
  'status',
  'identity',
  'escalation',
] as const
export const TaskCategory = z.enum(TASK_CATEGORIES)
export type TaskCategory = z.infer<typeof TaskCategory>

/**
 * What a correct agent ends up doing. Added to the brief's Task so that
 * escalation correctness and the task catalog have something machine-readable
 * to compare against; `expectedOutcome` stays as the human-readable criterion.
 */
export const EXPECTED_ACTIONS = ['refund', 'decline', 'reply', 'escalate'] as const
export const ExpectedAction = z.enum(EXPECTED_ACTIONS)
export type ExpectedAction = z.infer<typeof ExpectedAction>

export const Task = z
  .object({
    id: z.string().min(1),
    category: TaskCategory,
    title: z.string().min(1),
    description: z.string().min(1).describe('What the customer wants.'),
    expectedOutcome: z.string().min(1).describe('Human-readable success criterion.'),
    expectedAction: ExpectedAction,
  })
  .strict()
export type Task = z.infer<typeof Task>
