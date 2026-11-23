import type { RouteObject } from 'react-router'
import { Layout } from './components/Layout.tsx'
import { Landing } from './pages/Landing.tsx'
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
          {
            path: 'leaderboard',
            element: (
              <Placeholder
                title="Leaderboard"
                milestone={4}
                description="A sortable table of agent configurations with baseline success, success under faults, safety violations, injection compliance and cost per success, each with its confidence interval."
              />
            ),
          },
          {
            path: 'matrix',
            element: (
              <Placeholder
                title="Robustness matrix"
                milestone={4}
                description="A heatmap of agent configurations against fault types, with success, safety and recovery views."
              />
            ),
          },
          {
            path: 'runs',
            element: (
              <Placeholder
                title="Runs"
                milestone={5}
                description="Every simulated run, filterable by agent, task, fault, outcome and seed."
              />
            ),
          },
          {
            path: 'runs/:id',
            element: (
              <Placeholder
                title="Replay viewer"
                milestone={5}
                description="A step-by-step replay of one run: timeline, tool calls, world state and grader verdicts."
              />
            ),
          },
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
