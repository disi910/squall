import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { DataLoadError } from '../data/load.ts'
import { PageTitle } from './PageTitle.tsx'

/** Shown inside the layout, so the preview banner stays visible on errors and 404s. */
export function RouteError() {
  const error = useRouteError()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  let title = 'Something went wrong'
  let detail = 'An unexpected error occurred while rendering this page.'
  if (notFound) {
    title = 'Page not found'
    detail = 'There is no page at this address.'
  } else if (error instanceof DataLoadError) {
    title = 'The data could not be loaded'
    detail = `${error.message} If you are running Squall locally, generate the data first with "npm run generate".`
  } else if (error instanceof Error) {
    detail = error.message
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <PageTitle title={title} />
      <span className="eyebrow">{notFound ? '404' : 'Error'}</span>
      <h1 className="text-3xl">{title}</h1>
      <p className="text-muted">{detail}</p>
      <p>
        <Link to="/">← Back to the overview</Link>
      </p>
    </div>
  )
}
