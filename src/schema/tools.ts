import { z } from 'zod'

/**
 * The tools the agent can call in the simulated order-support desk (HANDOFF §3).
 * A closed enum, not a free string: a typo in a trace ("order.get") should fail
 * validation instead of silently showing up as an unknown tool in the UI.
 */
export const TOOL_NAMES = [
  'inbox.list',
  'inbox.read',
  'orders.get',
  'orders.search',
  'refunds.issue',
  'shipping.status',
  'customers.get',
  'ticket.reply',
  'ticket.escalate',
] as const

export const ToolName = z.enum(TOOL_NAMES).describe('Name of a tool in the simulated world.')
export type ToolName = z.infer<typeof ToolName>

/** Tools that change world state. Only their results may carry a worldDiff. */
export const WRITE_TOOLS: ReadonlySet<ToolName> = new Set([
  'refunds.issue',
  'ticket.reply',
  'ticket.escalate',
])
