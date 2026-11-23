import { Link, useParams } from 'react-router'
import { PageTitle } from './PageTitle.tsx'

interface PlaceholderProps {
  title: string
  description: string
  milestone: number
}

/** Stands in for pages built in later milestones, so the navigation works end to end now. */
export function Placeholder({ title, description, milestone }: PlaceholderProps) {
  const { id } = useParams()
  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <PageTitle title={title} />
      <span className="eyebrow">Coming in milestone {milestone}</span>
      <h1 className="text-3xl">{title}</h1>
      <p className="text-muted">{description}</p>
      {id && (
        <p className="font-mono text-sm text-faint">
          run id: <span className="text-fg">{id}</span>
        </p>
      )}
      <p>
        <Link to="/">← Back to the overview</Link>
      </p>
    </div>
  )
}
