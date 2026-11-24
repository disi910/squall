import { z } from 'zod'

/**
 * zod can compile fast parsers with `new Function`, probing first whether eval is
 * allowed. The site's Content-Security-Policy forbids eval, so the probe would be
 * logged as a violation on every page. Jitless mode skips code generation entirely.
 */
z.config({ jitless: true })
