import { Suspense } from 'react'
import { NavLink, Outlet, ScrollRestoration } from 'react-router'
import type { Location } from 'react-router'
import { Logo } from './Logo.tsx'
import { PageSkeleton } from './Skeleton.tsx'

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/matrix', label: 'Robustness matrix' },
  { to: '/runs', label: 'Runs' },
  { to: '/tasks', label: 'Tasks' },
  { to: '/report', label: 'Report' },
]

/** The page container: one column, 1180px max, with a 16px gutter on phones. */
export const container = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6'

/**
 * The preview banner is static, not data-driven, on purpose: it must be
 * visible on every page from the first paint, including error and loading
 * states (HANDOFF §2, honesty rule).
 */
export function PreviewBanner() {
  return (
    <div role="note" className="border-b border-line bg-surface-2">
      <div className={`${container} flex items-center gap-2.5 py-1.5 text-[13px] text-muted`}>
        <span className="flex-none rounded-sm border border-line-strong px-1.5 font-mono text-[11px] tracking-[0.08em] text-fg uppercase">
          Preview
        </span>
        <span>Preview: all results shown are simulated placeholder data.</span>
      </div>
    </div>
  )
}

function SiteHeader() {
  return (
    <div className={`${container} flex items-center gap-5 py-2.5`}>
      <NavLink
        to="/"
        className="flex flex-none items-center gap-2 font-display text-lg font-semibold text-fg no-underline"
        aria-label="Squall home"
      >
        <Logo />
        <span className="max-sm:sr-only">Squall</span>
      </NavLink>
      <nav
        aria-label="Main"
        className="flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none]"
      >
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap no-underline hover:bg-surface-2 hover:text-fg ${
                isActive
                  ? 'bg-surface-2 text-fg shadow-[inset_0_-2px_0_var(--muted)]'
                  : 'text-muted'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function SiteFooter() {
  return (
    <footer className="border-t border-line py-6 text-[13px] text-faint">
      <div className={`${container} flex flex-wrap justify-between gap-4`}>
        <span>
          Squall preview. Nordlys Supply is a fictional shop. Model names are placeholders, not real
          models.
        </span>
        <span className="font-mono">simulated data</span>
      </div>
    </footer>
  )
}

/**
 * main has a full-viewport minimum height so the footer starts below the fold:
 * otherwise it sits on screen while a page loads and jumps down when the
 * content arrives (a layout shift Lighthouse counts against us).
 */
/**
 * Scroll restoration key. React Router gives the first history entry of every
 * full page load the same key ("default"), and restores before lazy page
 * content has loaded, so a fresh load could open part-way down the page. The
 * first entry gets a key unique to this page load, so a fresh load always
 * starts at the top; back/forward within the app restores as usual.
 */
const PAGE_LOAD_ID = Math.random().toString(36).slice(2)
const scrollKey = (location: Location) =>
  location.key === 'default' ? `load-${PAGE_LOAD_ID}` : location.key

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-30 rounded-md bg-fg px-3 py-2 text-bg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-raised">
        <PreviewBanner />
        <SiteHeader />
      </header>
      <main id="main" tabIndex={-1} className={`${container} min-h-dvh flex-1 py-8 sm:py-10`}>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
      <ScrollRestoration getKey={scrollKey} />
    </div>
  )
}
