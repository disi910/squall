import { lazy } from 'react'
import { reloadOnce } from '../reloadOnce.ts'

/**
 * Every page but the landing page is split into its own chunk and loaded on
 * first visit, so the replay viewer's code never slows the landing page.
 * React.lazy (not the router's `lazy`) keeps the layout and the preview
 * banner on screen while a page chunk loads. reloadOnce recovers a tab opened
 * before a deploy, whose old chunk files are gone.
 */
export const Leaderboard = lazy(
  reloadOnce(() => import('./Leaderboard.tsx').then((m) => ({ default: m.Leaderboard }))),
)
export const Matrix = lazy(
  reloadOnce(() => import('./Matrix.tsx').then((m) => ({ default: m.Matrix }))),
)
export const Runs = lazy(reloadOnce(() => import('./Runs.tsx').then((m) => ({ default: m.Runs }))))
export const Replay = lazy(
  reloadOnce(() => import('./Replay.tsx').then((m) => ({ default: m.Replay }))),
)
export const Tasks = lazy(
  reloadOnce(() => import('./Tasks.tsx').then((m) => ({ default: m.Tasks }))),
)
export const Report = lazy(
  reloadOnce(() => import('./Report.tsx').then((m) => ({ default: m.Report }))),
)
