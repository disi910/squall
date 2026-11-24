/**
 * Captures the README screenshots in dark mode, using the Chrome already
 * installed on this machine (puppeteer-core downloads no browser).
 *
 *   npm run generate && npm run build && npm run preview   # in one terminal
 *   npm run screenshots                                     # in another
 *
 * Override the browser with CHROME=/path/to/chrome and the site with SITE=http://...
 * Each shot waits for a selector that only appears once the page's data has
 * rendered, so a slow load can never produce a screenshot of skeletons.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const SITE = process.env.SITE ?? 'http://localhost:4173'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots')

const SHOTS: { file: string; path: string; height: number; ready: string }[] = [
  { file: 'landing.png', path: '/', height: 900, ready: '::-p-text(Example finding · injection)' },
  { file: 'matrix.png', path: '/matrix?metric=safety', height: 900, ready: '[role="gridcell"]' },
  {
    file: 'replay.png',
    path: '/runs/g-injection?step=14',
    height: 1180,
    ready: '::-p-text(unauthorized)',
  },
  { file: 'leaderboard.png', path: '/leaderboard', height: 900, ready: 'table tbody tr' },
]

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((p): p is string => Boolean(p))

const executablePath = CANDIDATES.find((p) => existsSync(p))
if (!executablePath) {
  console.error('Could not find Chrome. Set CHROME=/path/to/chrome.')
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath, headless: true })
try {
  for (const shot of SHOTS) {
    const page = await browser.newPage()
    await page.setViewport({ width: 1440, height: shot.height })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
    await page.goto(SITE + shot.path, { waitUntil: 'networkidle0' })
    await page.waitForSelector(shot.ready, { timeout: 15000 })
    // A string, because this runs in the page and the scripts' TS config has no DOM types.
    await page.evaluate('document.fonts.ready')
    await page.screenshot({ path: join(OUT, shot.file) as `${string}.png` })
    await page.close()
    console.log(`wrote docs/screenshots/${shot.file}`)
  }
} finally {
  await browser.close()
}
