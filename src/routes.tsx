import type { RouteObject } from 'react-router'
import { Layout } from './components/Layout.tsx'
import { Landing } from './pages/Landing.tsx'
import { Leaderboard, Matrix, Replay, Runs } from './pages/lazy.ts'
import { Placeholder } from './pages/Placeholder.tsx'
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
          {
            path: 'tasks',
            element: (
              <Placeholder
                title="Tasks"
                milestone={6}
                description="The 20 support tickets with their written success criteria."
              />
            ),
          },
          {
            path: 'report',
            element: (
              <Placeholder
                title="Report"
                milestone={6}
                description="Methodology, example findings and limitations for the future study."
              />
            ),
          },
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
