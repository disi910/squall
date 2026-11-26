import { Suspense, use } from 'react'
import { Link } from 'react-router'
import { ReplayCard } from '../components/ReplayCard.tsx'
import { Skeleton } from '../components/Skeleton.tsx'
import { StatCard } from '../components/StatCard.tsx'
import { SuccessByFaultChart } from '../components/SuccessByFaultChart.tsx'
import { BUILD_DATA } from '../content/banner.ts'
import { copyFor, stepsSentence, verifierSentence } from '../content/copy.ts'
import { FEATURED_REPLAY_ID } from '../content/golden.ts'
import { ciRange, pct } from '../data/format.ts'
import { agentName, faultLabel } from '../data/labels.ts'
import { loadAnalysis, loadManifest } from '../data/load.ts'
import { PageTitle } from './PageTitle.tsx'

/** Static wording follows the dataset the site was built with. */
const COPY = copyFor(BUILD_DATA.source)

/**
 * The hero copy renders immediately; the numbers stream in once the data has
 * loaded. Each data-dependent block has its own Suspense boundary and a
 * fixed-size skeleton, so nothing shifts when it arrives.
 */
export function Landing() {
  return (
    <div className="flex flex-col gap-12">
      <PageTitle />
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <span className="eyebrow">Fault-injection testing for tool-using LLM agents</span>
          <h1 className="text-[clamp(30px,4.6vw,46px)] leading-[1.1]">
            Agents get evaluated on sunny days. Squall tests them in storms.
          </h1>
          <p className="max-w-[58ch] text-[17px] text-muted">
            Squall runs agents against a simulated order-support desk for a small web shop, then{' '}
            <strong className="font-medium text-fg">injects realistic faults</strong>: timeouts,
            malformed responses, stale data, contradictory sources and prompt injection. Every run
            is <strong className="font-medium text-fg">graded in code</strong> against the final
            world state, and the faults are seeded, so every run meets the same fault again. Each
            run is recorded as a trace you can{' '}
            <strong className="font-medium text-fg">replay step by step</strong>.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to={`/runs/${BUILD_DATA.featured ?? FEATURED_REPLAY_ID}`}
              className="rounded-md border border-fg bg-fg px-4 py-2 text-sm font-medium text-bg no-underline hover:opacity-90"
            >
              Watch a replay
            </Link>
            <Link
              to="/matrix"
              className="rounded-md border border-line-strong bg-surface px-4 py-2 text-sm text-fg no-underline hover:bg-surface-2"
            >
              See the robustness matrix
            </Link>
          </div>
          <Suspense fallback={<Skeleton className="h-4 w-80" />}>
            <DatasetSize />
          </Suspense>
        </div>
        <div className="card flex flex-col gap-2.5 p-4">
          <span className="eyebrow">Success rate by fault, all agents pooled</span>
          <Suspense fallback={<Skeleton className="aspect-[2/1] w-full" />}>
            <PooledChart />
          </Suspense>
          <p className="text-[12.5px] text-faint">{COPY.chartCaption}</p>
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-[22px]">{COPY.findingsTitle}</h2>
          <span className="text-[13px] text-faint">
            {COPY.findingsNote(BUILD_DATA.models.length, BUILD_DATA.seedCount)}
          </span>
        </div>
        <Suspense
          fallback={
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          }
        >
          <FindingCards />
        </Suspense>
      </section>

      <section className="flex flex-col gap-3.5">
        <h2 className="text-[22px]">How a run works</h2>
        <ol className="card grid overflow-hidden md:grid-cols-5">
          {HOW_IT_WORKS.map((s) => (
            <li
              key={s.label}
              className={`flex flex-col gap-1.5 border-line p-4 max-md:border-b max-md:last:border-b-0 md:border-r md:last:border-r-0 ${s.fault ? 'bg-fault-soft' : ''}`}
            >
              <span className={`eyebrow ${s.fault ? 'text-fault' : ''}`}>{s.label}</span>
              <h3 className="text-base">{s.title}</h3>
              <p className="text-[13.5px] text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-[22px]">Featured replays</h2>
          <Link to="/runs">All runs →</Link>
        </div>
        <Suspense
          fallback={
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-52" />
              ))}
            </div>
          }
        >
          <FeaturedReplays />
        </Suspense>
      </section>
    </div>
  )
}

const HOW_IT_WORKS = [
  {
    label: 'Task',
    title: 'A customer ticket',
    text: 'Refunds, policy edge cases, order status, identity checks and escalations.',
  },
  {
    label: 'Agent',
    title: 'Model + design',
    text: COPY.agentStep(BUILD_DATA.models, BUILD_DATA.designs),
  },
  {
    label: 'Fault layer',
    title: 'Seeded faults',
    text: 'Sits between the agent and its tools. Same seed, same fault, same timing.',
    fault: true,
  },
  {
    label: 'World',
    title: 'Orders, refunds, tickets',
    text: 'Every tool call that writes is recorded as a change to the world state.',
  },
  {
    label: 'Graders',
    title: 'Checked in code',
    text: 'Deterministic checks on the final state. Safety failures count separately.',
  },
]

function DatasetSize() {
  const manifest = use(loadManifest())
  const { runCount } = use(loadAnalysis()).findings
  return (
    <span className="font-mono text-[12.5px] text-faint">
      {copyFor(manifest.source).datasetLine(
        runCount,
        manifest.agents.length,
        manifest.faultSettings.length,
        manifest.tasks.length,
        manifest.seeds.length,
      )}
    </span>
  )
}

function PooledChart() {
  return <SuccessByFaultChart data={use(loadAnalysis()).findings.successByFault} />
}

function FindingCards() {
  const manifest = use(loadManifest())
  const f = use(loadAnalysis()).findings
  const copy = copyFor(manifest.source)
  const single = manifest.agents.length === 1
  const models = [...new Set(manifest.agents.map((a) => a.modelLabel))]
  const v = f.verifierOnSilentFailure
  const gap = v ? Math.round((v.verifier.rate - v.react.rate) * 100) : null
  const cards = [
    f.hardestFault && (
      <StatCard
        key="hardest"
        eyebrow={copy.findingEyebrow('hardest fault')}
        value={pct(f.hardestFault.rate.rate)}
        footnote={`95% CI ${ciRange(f.hardestFault.rate)} · n=${f.hardestFault.rate.n}`}
      >
        Success under {faultLabel(f.hardestFault.key).toLowerCase()}, the lowest of any fault
        {single ? '' : ', pooled over agents'}.
      </StatCard>
    ),
    f.mostInjectable && (
      <StatCard
        key="injection"
        eyebrow={copy.findingEyebrow('injection')}
        value={pct(f.mostInjectable.rate.rate)}
        footnote={`95% CI ${ciRange(f.mostInjectable.rate)} · n=${f.mostInjectable.rate.n}`}
      >
        {single
          ? `${agentName(f.mostInjectable.agent)} followed injected instructions in this share of prompt-injection runs.`
          : f.mostInjectable.rate.rate === 0
            ? 'No agent config followed an injected instruction in any prompt-injection run.'
            : `${agentName(f.mostInjectable.agent)} followed injected instructions in this share of prompt-injection runs, the most of any config.`}
      </StatCard>
    ),
    v && gap !== null && (
      <StatCard
        key="verifier"
        eyebrow={copy.findingEyebrow('silent failure')}
        value={`${gap >= 0 ? '+' : ''}${gap}`}
        unit="pts"
        footnote={`ReAct ${ciRange(v.react)} · verifier ${ciRange(v.verifier)}`}
      >
        {verifierSentence(v.react.rate, v.verifier.rate, models)}
      </StatCard>
    ),
    f.steps && (
      <StatCard
        key="steps"
        eyebrow={copy.findingEyebrow('cost of failure')}
        value={(f.steps.failed / f.steps.succeeded).toFixed(1)}
        unit="×"
        footnote={`mean steps · all ${f.runCount.toLocaleString('en-US')} runs`}
      >
        {stepsSentence(f.steps.failed, f.steps.succeeded)}
      </StatCard>
    ),
  ].filter(Boolean)
  return <div className="grid gap-4 md:grid-cols-3">{cards.slice(0, 3)}</div>
}

function FeaturedReplays() {
  const manifest = use(loadManifest())
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(manifest.featuredRunIds?.length ? manifest.featuredRunIds : manifest.goldenRunIds).map(
        (id) => (
          <ReplayCard key={id} runId={id} />
        ),
      )}
    </div>
  )
}
