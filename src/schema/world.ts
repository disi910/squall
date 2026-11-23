import { z } from 'zod'

/**
 * The world state graders inspect. Every collection is a record keyed by id,
 * not an array, so a change can be addressed by a stable JSON Pointer such as
 * `/orders/4402/status`. With arrays the pointer would be `/orders/3/status`,
 * which breaks as soon as anything is inserted or reordered.
 *
 * Amounts are in whole currency units of the order's `currency` (NOK for the
 * simulated shop).
 */
const Id = z.string().min(1)
const Amount = z.number().nonnegative()

export const Customer = z
  .object({ name: z.string().min(1), email: z.email(), city: z.string().optional() })
  .strict()

export const ORDER_STATUSES = [
  'processing',
  'shipped',
  'in_transit',
  'partially_delivered',
  'delivered',
  'exception',
  'return_received',
  'partially_refunded',
  'refunded',
  'cancelled',
] as const
export const OrderStatus = z.enum(ORDER_STATUSES)

export const OrderItem = z
  .object({ name: z.string().min(1), qty: z.int().positive(), unitPrice: Amount })
  .strict()

export const Order = z
  .object({
    customerId: Id,
    items: z.array(OrderItem).min(1),
    total: Amount,
    currency: z.literal('NOK'),
    status: OrderStatus,
    trackingId: Id.optional(),
    deliveredAt: z.iso.date().optional(),
  })
  .strict()

export const Refund = z
  .object({ orderId: Id, amount: Amount, reason: z.string(), currency: z.literal('NOK') })
  .strict()

export const TICKET_STATUSES = ['open', 'replied', 'escalated', 'closed'] as const
export const Ticket = z
  .object({
    from: z.email(),
    subject: z.string(),
    status: z.enum(TICKET_STATUSES),
    replies: z.int().nonnegative(),
  })
  .strict()

/** The carrier's view of a parcel. Read-only for the agent; the source of truth for `stale_data`. */
export const Shipment = z
  .object({ carrierStatus: z.string().min(1), detail: z.string(), updatedAt: z.iso.date() })
  .strict()

export const WorldState = z
  .object({
    now: z.iso
      .date()
      .describe('Simulated current date, used by date-based policy (30-day window).'),
    customers: z.record(Id, Customer),
    orders: z.record(Id, Order),
    refunds: z.record(Id, Refund),
    tickets: z.record(Id, Ticket),
    shipments: z.record(Id, Shipment).describe('Keyed by tracking id.'),
  })
  .strict()
export type WorldState = z.infer<typeof WorldState>

/**
 * One change to the world, recorded on the tool result that caused it.
 * `before: null` means the value did not exist (an add); `after: null` means
 * it was removed. Paths use RFC 6901 JSON Pointer syntax.
 */
export const WorldChange = z
  .object({
    path: z
      .string()
      .regex(/^(\/[^/]+)+$/, 'must be a JSON Pointer like /orders/4402/status')
      .describe('RFC 6901 JSON Pointer into the world state.'),
    before: z.unknown().describe('Value before the change; null if it did not exist.'),
    after: z.unknown().describe('Value after the change; null if it was removed.'),
  })
  .strict()
export type WorldChange = z.infer<typeof WorldChange>

// ---------- JSON Pointer helpers (used by validation and the replay viewer) ----------

function pointerTokens(path: string): string[] {
  // RFC 6901: "~1" encodes "/" and "~0" encodes "~"; decode ~1 first.
  return path
    .split('/')
    .slice(1)
    .map((t) => t.replaceAll('~1', '/').replaceAll('~0', '~'))
}

type JsonObject = Record<string, unknown>
const isObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Returns the value at `path`, or null when any segment is missing. */
export function getAtPointer(root: unknown, path: string): unknown {
  let node: unknown = root
  for (const key of pointerTokens(path)) {
    if (!isObject(node) || !(key in node)) return null
    node = node[key]
  }
  return node === undefined ? null : node
}

/** Sets (or, for `value === null`, deletes) the value at `path`, creating parents as needed. Mutates `root`. */
export function setAtPointer(root: JsonObject, path: string, value: unknown): void {
  const keys = pointerTokens(path)
  let node: JsonObject = root
  for (const key of keys.slice(0, -1)) {
    const next = node[key]
    if (!isObject(next)) node[key] = {}
    node = node[key] as JsonObject
  }
  const last = keys[keys.length - 1]
  if (last === undefined) return
  if (value === null) delete node[last]
  else node[last] = structuredClone(value)
}

/** Structural equality for JSON values; key order does not matter. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]))
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a)
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && jsonEqual(a[k], b[k]))
  }
  return false
}
