import { z } from 'zod'
import { FaultId } from './faults.ts'
import { SCHEMA_VERSION } from './run.ts'
import { Task } from './task.ts'
import { ToolName } from './tools.ts'
import { OrderItem, OrderStatus } from './world.ts'

/**
 * The shared scenario catalog (`scenarios/catalog.json`). Both the TypeScript mock
 * generator and the Python harness build their worlds, faults and grading
 * expectations from it, so the two can never drift apart. `Task` fields go into
 * dataset manifests; everything else is world data and grading expectations.
 */

export const CustomerSeed = z
  .object({ id: z.string().min(1), name: z.string().min(1), email: z.email(), city: z.string() })
  .strict()
export type CustomerSeed = z.infer<typeof CustomerSeed>

export const PaymentSeed = z
  .object({
    id: z.string().min(1),
    amount: z.number().nonnegative(),
    daysAgo: z.int().nonnegative().describe('Days before "now" the payment was captured.'),
  })
  .strict()

export const ShipmentSeed = z
  .object({ status: z.string().min(1), detail: z.string() })
  .strict()
  .describe("The carrier's truth for this order's parcel.")

export const OrderSeed = z
  .object({
    id: z.string().min(1),
    customerId: z.string().min(1).optional().describe("Defaults to the scenario's first customer."),
    items: z.array(OrderItem).min(1),
    status: OrderStatus,
    deliveredDaysAgo: z.int().nonnegative().optional(),
    trackingId: z.string().min(1),
    shipment: ShipmentSeed,
    payments: z.array(PaymentSeed),
  })
  .strict()
export type OrderSeed = z.infer<typeof OrderSeed>

export const REPLY_DECISIONS = [
  'refund',
  'decline',
  'inform',
  'request_verification',
  'escalated',
] as const
export const ReplyDecision = z.enum(REPLY_DECISIONS)
export type ReplyDecision = z.infer<typeof ReplyDecision>

export const ExpectedReply = z
  .object({
    decision: ReplyDecision,
    statedStatus: z
      .string()
      .min(1)
      .optional()
      .describe('Carrier status the reply must state, for status questions.'),
    acceptedDecisions: z
      .array(ReplyDecision)
      .optional()
      .describe('Other decisions that are also correct, where the task reads more than one way.'),
  })
  .strict()

export const FaultData = z
  .object({
    staleStatus: OrderStatus.describe('What orders.get reports under stale_data.'),
    altCarrierStatus: z
      .string()
      .min(1)
      .describe('What shipping.status reports under contradictory_sources.'),
    altCarrierDetail: z.string(),
  })
  .strict()

export const FaultExpectation = z
  .object({
    expectedReply: ExpectedReply.optional(),
    refund: z.number().nonnegative().nullable().optional(),
  })
  .strict()

export const Scenario = Task.extend({
  customers: z.array(CustomerSeed).min(1),
  order: OrderSeed,
  extraOrders: z.array(OrderSeed).optional(),
  ticket: z
    .object({
      id: z.string().min(1),
      from: z.email().optional().describe("Defaults to the first customer's email."),
      subject: z.string().min(1),
      body: z.string().min(1),
    })
    .strict(),
  refund: z.number().nonnegative().optional().describe('The correct refund amount, if any.'),
  unsafeAmount: z
    .number()
    .nonnegative()
    .optional()
    .describe('The wrong amount an unsafe agent refunds (used by the mock generator).'),
  policy: z
    .string()
    .optional()
    .describe('The reasoning a correct agent gives on policy-edge tasks.'),
  expectedTools: z.array(ToolName).min(1).describe('The tools a correct agent calls.'),
  expectedReply: ExpectedReply,
  privateValues: z
    .array(z.string().min(1))
    .describe('World values that must not appear in a reply on this task.'),
  faultData: FaultData,
  underFault: z
    .partialRecord(FaultId, FaultExpectation)
    .optional()
    .describe('Expectations that differ from the baseline under a fault.'),
  tier: z.string().optional().describe('Reserved for complexity tiers; unused.'),
}).strict()
export type Scenario = z.infer<typeof Scenario>

export const ScenarioCatalog = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    now: z.iso.date().describe('The simulated "today".'),
    injection: z
      .object({
        order: OrderSeed,
        customer: CustomerSeed,
        excerpt: z.string().min(1).describe('The injected instruction, highlighted in the replay.'),
        text: z.string().min(1).describe('Appended to the ticket body under prompt_injection.'),
        privateValues: z.array(z.string().min(1)),
      })
      .strict(),
    scenarios: z.array(Scenario).length(20),
  })
  .strict()
  .meta({ title: 'ScenarioCatalog', description: 'The shared Squall task catalog.' })
export type ScenarioCatalog = z.infer<typeof ScenarioCatalog>
