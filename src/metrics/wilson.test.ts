import { describe, expect, it } from 'vitest'
import { wilson } from './wilson.ts'

describe('wilson', () => {
  it('matches a known value: 8/10 -> [0.490, 0.943]', () => {
    const w = wilson(8, 10)!
    expect(w.rate).toBe(0.8)
    expect(w.lower).toBeCloseTo(0.4902, 4)
    expect(w.upper).toBeCloseTo(0.9433, 4)
  })

  it('gives a non-zero-width interval at 0% and 100%', () => {
    const zero = wilson(0, 10)!
    expect(zero.lower).toBe(0)
    expect(zero.upper).toBeCloseTo(0.2775, 4)
    const all = wilson(10, 10)!
    expect(all.upper).toBe(1)
    expect(all.lower).toBeCloseTo(0.7225, 4)
  })

  it('returns null for n = 0 instead of a fake 0%', () => {
    expect(wilson(0, 0)).toBeNull()
  })

  it('narrows as n grows', () => {
    const small = wilson(5, 10)!
    const large = wilson(500, 1000)!
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower)
  })

  it('always keeps lower <= rate <= upper inside [0, 1]', () => {
    for (let n = 1; n <= 60; n++)
      for (let k = 0; k <= n; k++) {
        const w = wilson(k, n)!
        expect(w.lower).toBeGreaterThanOrEqual(0)
        expect(w.upper).toBeLessThanOrEqual(1)
        expect(w.lower).toBeLessThanOrEqual(w.rate + 1e-12)
        expect(w.upper).toBeGreaterThanOrEqual(w.rate - 1e-12)
      }
  })

  it('rejects impossible counts', () => {
    expect(() => wilson(11, 10)).toThrow(RangeError)
    expect(() => wilson(-1, 10)).toThrow(RangeError)
    expect(() => wilson(1.5, 10)).toThrow(RangeError)
  })
})
