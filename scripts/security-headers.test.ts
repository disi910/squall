import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const vercel = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'vercel.json'), 'utf8'))
const all = vercel.headers.find((h: { source: string }) => h.source === '/(.*)')
const header = (key: string): string | undefined =>
  all?.headers.find((h: { key: string }) => h.key === key)?.value

describe('security headers on every response', () => {
  it('sets a strict content security policy', () => {
    const csp = header('Content-Security-Policy') ?? ''
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'none'",
    ])
      expect(csp).toContain(directive)
    expect(csp).not.toMatch(/script-src[^;]*unsafe/)
  })

  it('sets the standard hardening headers', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff')
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header('X-Frame-Options')).toBe('DENY')
    expect(header('Permissions-Policy')).toContain('camera=()')
  })
})
