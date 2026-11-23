import { Suspense, use } from 'react'
import { Link } from 'react-router'
import { ReplayCard } from '../components/ReplayCard.tsx'
import { Skeleton } from '../components/Skeleton.tsx'
import { StatCard } from '../components/StatCard.tsx'
import { SuccessByFaultChart } from '../components/SuccessByFaultChart.tsx'
import { FEATURED_REPLAY_ID } from '../content/golden.ts'
import { ciRange, pct } from '../data/format.ts'
import { agentName } from '../data/labels.ts'
import { loadFindings, loadManifest } from '../data/load.ts'
import { PageTitle } from './PageTitle.tsx'

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
            world state, so results are reproducible down to the seed. Each run is recorded as a
            trace you can <strong className="font-medium text-fg">replay step by step</strong>.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to={`/runs/${FEATURED_REPLAY_ID}`}
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
          <p className="text-[12.5px] text-faint">
            Bars show the success rate; whiskers show the 95% Wilson interval. Simulated data.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 className="text-[22px]">Example findings</h2>
          <span className="text-[13px] text-faint">
            Hypothetical. Computed from the simulated runs to show the format.
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
    text: 'ReAct, plan-and-execute, or ReAct with a verifier step, on three placeholder models.',
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
  const { runCount } = use(loadFindings())
  return (
    <span className="font-mono text-[12.5px] text-faint">
      {runCount.toLocaleString('en-US')} simulated runs · {manifest.agents.length} agent configs ·{' '}
      {manifest.faultSettings.length} fault settings · {manifest.tasks.length} tasks ·{' '}
      {manifest.seeds.length} seeds
    </span>
  )
}

function PooledChart() {
  return <SuccessByFaultChart data={use(loadFindings()).successByFault} />
}

function FindingCards() {
  const f = use(loadFindings())
  const gap = f.verifierOnSilentFailure
    ? Math.round(
        (f.verifierOnSilentFailure.verifier.rate - f.verifierOnSilentFailure.react.rate) * 100,
      )
    : null
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {f.mostInjectable && (
        <StatCard
          eyebrow="Example finding · injection"
          value={pct(f.mostInjectable.rate.rate)}
          footnote={`95% CI ${ciRange(f.mostInjectable.rate)} · n=${f.mostInjectable.rate.n}`}
        >
          {agentName(f.mostInjectable.agent)} followed injected instructions in this share of
          prompt-injection runs, the most of any config.
        </StatCard>
      )}
      {f.verifierOnSilentFailure && gap !== null && (
        <StatCard
          eyebrow="Example finding · silent failure"
          value={`${gap >= 0 ? '+' : ''}${gap}`}
          unit="pts"
          footnote={`ReAct ${ciRange(f.verifierOnSilentFailure.react)} · verifier ${ciRange(f.verifierOnSilentFailure.verifier)}`}
        >
          A verifier step lifts success under silent failure from{' '}
          {pct(f.verifierOnSilentFailure.react.rate)} to{' '}
          {pct(f.verifierOnSilentFailure.verifier.rate)}, pooled over models.
        </StatCard>
      )}
      {f.steps && (
        <StatCard
          eyebrow="Example finding · cost of failure"
          value={(f.steps.failed / f.steps.succeeded).toFixed(1)}
          unit="×"
          footnote={`mean steps · all ${f.runCount.toLocaleString('en-US')} runs`}
        >
          Failed and unsafe runs take more steps than successful ones ({f.steps.failed.toFixed(1)}{' '}
          vs {f.steps.succeeded.toFixed(1)} on average).
        </StatCard>
      )}
    </div>
  )
}

function FeaturedReplays() {
  const manifest = use(loadManifest())
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {manifest.goldenRunIds.map((id) => (
        <ReplayCard key={id} runId={id} />
      ))}
    </div>
  )
}
