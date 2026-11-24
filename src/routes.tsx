import type { RouteObject } from 'react-router'
import { Layout } from './components/Layout.tsx'
import { Landing } from './pages/Landing.tsx'
import { Leaderboard, Matrix, Replay, Report, Runs, Tasks } from './pages/lazy.ts'
import { RouteError } from './pages/RouteError.tsx'

/**
 * Route table, shared by the app and the tests. The error boundary sits on a
 * pathless child route, not on the layout, so errors and 404s render inside
 * the layout and keep the preview banner.
 */
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Landing /> },
          { path: 'leaderboard', element: <Leaderboard /> },
          { path: 'matrix', element: <Matrix /> },
          { path: 'runs', element: <Runs /> },
          { path: 'runs/:id', element: <Replay /> },
          { path: 'tasks', element: <Tasks /> },
          { path: 'report', element: <Report /> },
          {
            path: '*',
            element: <RouteError />,
            loader: () => {
              throw new Response('Not found', { status: 404 })
            },
          },
        ],
      },
    ],
  },
]
