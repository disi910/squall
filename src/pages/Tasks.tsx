import { use } from 'react'
import { Link } from 'react-router'
import { Chip } from '../components/Badges.tsx'
import { Rate } from '../components/Rate.tsx'
import { CATEGORY_LABEL, EXPECTED_ACTION_LABEL } from '../data/labels.ts'
import { loadAnalysis, loadManifest } from '../data/load.ts'
import { TASK_CATEGORIES } from '../schema/index.ts'
import { PageTitle } from './PageTitle.tsx'

/** The task catalog: what each ticket asks, what counts as success, and how the agents did on it. */
export function Tasks() {
  const manifest = use(loadManifest())
  const { tasks: stats } = use(loadAnalysis())

  return (
    <div className="flex flex-col gap-8">
      <PageTitle title="Tasks" />
      <div className="flex max-w-[760px] flex-col gap-2">
        <span className="eyebrow">Task catalog</span>
        <h1 className="text-3xl">Tasks</h1>
        <p className="text-muted">
          {manifest.tasks.length} support tickets for Nordlys Supply, a fictional outdoor-gear shop.
          Each task has a written success criterion that the graders check in code against the final
          world state. Rates pool every agent config.
        </p>
      </div>

      {TASK_CATEGORIES.map((category) => {
        const tasks = manifest.tasks.filter((t) => t.category === category)
        if (!tasks.length) return null
        return (
          <section
            key={category}
            className="flex flex-col gap-3"
            aria-labelledby={`cat-${category}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 id={`cat-${category}`} className="text-[22px]">
                {CATEGORY_LABEL[category]}
              </h2>
              <span className="font-mono text-xs text-faint">{tasks.length} tasks</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {tasks.map((t) => {
                const s = stats[t.id]
                return (
                  <article key={t.id} className="card flex flex-col gap-2.5 px-4 py-3.5">
                    <div className="flex items-baseline justify-between gap-2.5">
                      <h3 className="text-base">{t.title}</h3>
                      <span className="font-mono text-xs text-faint">{t.id}</span>
                    </div>
                    <p className="text-[13.5px] text-muted">{t.description}</p>
                    <p className="border-l-2 border-line-strong pl-2.5 text-[13px]">
                      <span className="sr-only">Success criterion: </span>
                      {t.expectedOutcome}
                    </p>
                    <div>
                      <Chip>expected: {EXPECTED_ACTION_LABEL[t.expectedAction]}</Chip>
                    </div>
                    {s && (
                      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-line pt-2.5">
                        <div className="flex flex-col gap-1">
                          <dt className="font-mono text-[11px] text-faint">Baseline success</dt>
                          <dd className="m-0">
                            <Rate p={s.baseline} />
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="font-mono text-[11px] text-faint">Under faults</dt>
                          <dd className="m-0">
                            <Rate p={s.underFaults} />
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1">
                          <dt className="font-mono text-[11px] text-faint">Safety violations</dt>
                          <dd className="m-0">
                            <Rate p={s.safety} />
                          </dd>
                        </div>
                      </dl>
                    )}
                    <Link
                      to={`/runs?task=${encodeURIComponent(t.id)}`}
                      className="self-start text-[13px]"
                    >
                      {s?.runCount.toLocaleString('en-US') ?? 0} runs →
                    </Link>
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
