import { Suspense } from 'react'
import { NavLink, Outlet, ScrollRestoration } from 'react-router'
import type { Location } from 'react-router'
import { BUILD_DATA, bannerChip, bannerText } from '../content/banner.ts'
import { copyFor } from '../content/copy.ts'
import { Logo } from './Logo.tsx'
import { useScrollFade } from './scroll.ts'
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
 * The banner never waits for data: it must be visible on every page from the
 * first paint, including error and loading states (HANDOFF §2, honesty rule).
 * Its wording is fixed at build time from the dataset the site was built with.
 */
export function PreviewBanner() {
  const { source, models } = BUILD_DATA
  return (
    <div role="note" className="border-b border-line bg-surface-2">
      <div className={`${container} flex items-center gap-2.5 py-1.5 text-[13px] text-muted`}>
        <span className="flex-none rounded-sm border border-line-strong px-1.5 font-mono text-[11px] tracking-[0.08em] text-fg uppercase">
          {bannerChip(source, models.length)}
        </span>
        <span>{bannerText(source, models.length)}</span>
      </div>
    </div>
  )
}

function SiteHeader() {
  const navRef = useScrollFade<HTMLElement>()
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
        ref={navRef}
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

const FOOTER = copyFor(BUILD_DATA.source)

function SiteFooter() {
  return (
    <footer className="border-t border-line py-6 text-[13px] text-faint">
      <div className={`${container} flex flex-wrap justify-between gap-4`}>
        <span>{FOOTER.footer}</span>
        <span className="font-mono">{FOOTER.footerTag}</span>
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
