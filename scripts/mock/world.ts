import type { WorldState } from '../../src/schema/index.ts'
import { CATALOG } from './scenarios.ts'
import type { CustomerSeed, OrderSeed, Scenario } from './scenarios.ts'

/** The simulated "today". Fixed, so date-based policy (the 30-day window) is reproducible. */
export const NOW = CATALOG.now

export const daysAgo = (n: number) => {
  const d = new Date(`${NOW}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** The other customer's order that the injected instruction tries to get refunded. */
export const INJECTION_TARGET: { order: OrderSeed; customer: CustomerSeed } = CATALOG.injection
export const INJECTION_EXCERPT = CATALOG.injection.excerpt
export const INJECTION_TEXT = CATALOG.injection.text

export const orderTotal = (o: OrderSeed) => o.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)

function addOrder(world: WorldState, o: OrderSeed, fallbackCustomer: string) {
  world.orders[o.id] = {
    customerId: o.customerId ?? fallbackCustomer,
    items: o.items.map((i) => ({ ...i })),
    total: orderTotal(o),
    currency: 'NOK',
    status: o.status,
    trackingId: o.trackingId,
    ...(o.deliveredDaysAgo !== undefined ? { deliveredAt: daysAgo(o.deliveredDaysAgo) } : {}),
  }
  world.shipments[o.trackingId] = {
    carrierStatus: o.shipment.status,
    detail: o.shipment.detail,
    updatedAt: NOW,
  }
  for (const p of o.payments)
    (world.payments ??= {})[p.id] = {
      orderId: o.id,
      amount: p.amount,
      currency: 'NOK',
      capturedAt: daysAgo(p.daysAgo),
    }
}

/** The world before the first step. Injection runs also contain the targeted order and its owner. */
export function initialWorldFor(s: Scenario, withInjectionTarget: boolean): WorldState {
  const primary = s.customers[0]
  if (!primary) throw new Error(`${s.id} has no customers`)
  const world: WorldState = {
    now: NOW,
    customers: {},
    orders: {},
    refunds: {},
    tickets: {},
    shipments: {},
    payments: {},
  }
  for (const cu of s.customers)
    world.customers[cu.id] = { name: cu.name, email: cu.email, city: cu.city }
  world.tickets[s.ticket.id] = {
    from: s.ticket.from ?? primary.email,
    subject: s.ticket.subject,
    status: 'open',
    replies: 0,
  }
  addOrder(world, s.order, primary.id)
  for (const o of s.extraOrders ?? []) addOrder(world, o, primary.id)
  if (withInjectionTarget) {
    const { order, customer } = INJECTION_TARGET
    world.customers[customer.id] = {
      name: customer.name,
      email: customer.email,
      city: customer.city,
    }
    addOrder(world, order, customer.id)
  }
  return world
}
