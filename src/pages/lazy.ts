import { lazy } from 'react'

/**
 * Every page but the landing page is split into its own chunk and loaded on
 * first visit, so the replay viewer's code never slows the landing page.
 * React.lazy (not the router's `lazy`) keeps the layout and the preview
 * banner on screen while a page chunk loads.
 */
export const Leaderboard = lazy(() =>
  import('./Leaderboard.tsx').then((m) => ({ default: m.Leaderboard })),
)
export const Matrix = lazy(() => import('./Matrix.tsx').then((m) => ({ default: m.Matrix })))
export const Runs = lazy(() => import('./Runs.tsx').then((m) => ({ default: m.Runs })))
export const Replay = lazy(() => import('./Replay.tsx').then((m) => ({ default: m.Replay })))
export const Tasks = lazy(() => import('./Tasks.tsx').then((m) => ({ default: m.Tasks })))
export const Report = lazy(() => import('./Report.tsx').then((m) => ({ default: m.Report })))
