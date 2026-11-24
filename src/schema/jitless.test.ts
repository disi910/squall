import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { Run } from './index.ts'

describe('zod configuration', () => {
  it('never generates code at runtime, so a strict CSP (no eval) is never tripped', () => {
    expect(Run).toBeDefined()
    expect(z.config().jitless).toBe(true)
  })
})
