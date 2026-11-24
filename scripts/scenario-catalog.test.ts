import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAULT_IDS, ScenarioCatalog, TOOL_NAMES } from '../src/schema/index.ts'

const raw = JSON.parse(readFileSync(join(import.meta.dirname, '../scenarios/catalog.json'), 'utf8'))

describe('scenario catalog', () => {
  it('parses with the ScenarioCatalog schema', () => {
    const r = ScenarioCatalog.safeParse(raw)
    expect(r.success ? [] : r.error.issues.slice(0, 5)).toEqual([])
  })

  const catalog = ScenarioCatalog.parse(raw)
  const byId = (id: string) => catalog.scenarios.find((s) => s.id === id)!

  it('has 20 scenarios and every one has fault data and a shipment', () => {
    expect(catalog.scenarios).toHaveLength(20)
    for (const s of catalog.scenarios) {
      expect(s.faultData.staleStatus, s.id).toBeTruthy()
      expect(s.faultData.altCarrierStatus, s.id).not.toBe(s.order.shipment.status)
    }
  })

  it('lists only known tools in expectedTools', () => {
    for (const s of catalog.scenarios)
      for (const t of s.expectedTools) expect(TOOL_NAMES, s.id).toContain(t)
  })

  it('prices the headlamp in T03 so a real agent can find 349 NOK', () => {
    const t03 = byId('T03')
    expect(t03.order.items.some((i) => i.unitPrice === 349)).toBe(true)
    expect(t03.order.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)).toBe(1149)
  })

  it('records two captured payments for the T04 order', () => {
    const t04 = byId('T04')
    expect(t04.order.payments.filter((p) => p.amount === 612)).toHaveLength(2)
  })

  it('keys underFault only by fault ids', () => {
    for (const s of catalog.scenarios)
      for (const k of Object.keys(s.underFault ?? {})) expect(FAULT_IDS, s.id).toContain(k)
  })
})

describe('contradictory_sources data', () => {
  const catalog = ScenarioCatalog.parse(raw)
  const phrase = (s: string) => s.toLowerCase().replace(/_/g, ' ')
  // Carrier statuses that agree with each order status (no conflict to notice).
  const COMPATIBLE: Record<string, string[]> = {
    delivered: ['delivered'],
    return_received: ['return_delivered'],
    processing: ['label_created'],
    shipped: ['in_transit', 'out_for_delivery', 'held_at_customs', 'delayed'],
    in_transit: ['in_transit', 'out_for_delivery', 'delayed'],
    partially_delivered: ['in_transit'],
  }

  it('describes the alternative carrier status in its own detail text', () => {
    for (const s of catalog.scenarios)
      expect(phrase(s.faultData.altCarrierDetail), s.id).toContain(
        phrase(s.faultData.altCarrierStatus),
      )
  })

  it('contradicts the order record, unless the task says the fault is not a conflict', () => {
    for (const s of catalog.scenarios) {
      const agrees = (COMPATIBLE[s.order.status] ?? []).includes(s.faultData.altCarrierStatus)
      const explicit = s.underFault?.contradictory_sources?.expectedReply?.decision
      if (agrees) expect(explicit && explicit !== 'escalated', s.id).toBe(true)
    }
  })
})
