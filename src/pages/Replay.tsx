import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Chip, FaultChip, OutcomePill } from '../components/Badges.tsx'
import { GraderStrip } from '../components/replay/GraderStrip.tsx'
import { StepDetail } from '../components/replay/StepDetail.tsx'
import { Timeline, TimelineLegend } from '../components/replay/Timeline.tsx'
import { WorldPanel } from '../components/replay/WorldPanel.tsx'
import { GOLDEN_COPY } from '../content/golden.ts'
import { fmtCompact } from '../data/format.ts'
import { DESIGN_LABEL, STEP_LABEL } from '../data/labels.ts'
import { loadManifest, loadRunIndex, loadRunSummary, loadTrace } from '../data/load.ts'
import {
  changedPaths,
  failuresByStep,
  harmfulChanges,
  parseStep,
  worldStates,
} from '../data/replay.ts'
import { faultKey } from '../schema/helpers.ts'
import type { AgentConfig, DatasetManifest, Run, RunSummary } from '../schema/index.ts'
import { PageTitle } from './PageTitle.tsx'

const PLAY_INTERVAL_MS = 900

/**
 * /runs/:id. A run with a trace file opens the replay viewer; a summary-only
 * run (seeds 2–5 in the mock data) shows its graders and links to the
 * replayable run of the same cell; anything else is "not found".
 */
export function Replay() {
  const { id = '' } = useParams()
  const manifest = use(loadManifest())
  // `use` may be called conditionally, unlike hooks.
  if (manifest.goldenRunIds.includes(id) || manifest.tracedRunIds.includes(id))
    // Keyed by run, so moving from one replay to another starts fresh at that run's ?step.
    return <TraceView key={id} run={use(loadTrace(id))} manifest={manifest} />
  const summary = use(loadRunSummary(id))
  if (summary) return <SummaryView summary={summary} manifest={manifest} />
  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <PageTitle title="Run not found" />
      <span className="eyebrow">Replay</span>
      <h1 className="text-3xl">Run not found</h1>
      <p className="text-muted">
        There is no run with the id <code className="font-mono text-fg">{id}</code> in this dataset.
      </p>
      <Link to="/runs">← All runs</Link>
    </div>
  )
}

function RunHeader({
  run,
  manifest,
  title,
}: {
  run: RunSummary | Run
  manifest: DatasetManifest
  title: string
}) {
  const task = manifest.tasks.find((t) => t.id === run.taskId)
  const stepCount = 'steps' in run ? run.steps.length : run.stepCount
  return (
    <div className="flex flex-col gap-2.5">
      <Link to="/runs" className="font-mono text-[13px]">
        ← All runs
      </Link>
      <h1 className="text-[clamp(24px,3vw,30px)]">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <OutcomePill outcome={run.outcome} />
        <FaultChip fault={faultKey(run.faults)} />
        {manifest.goldenRunIds.includes(run.id) && <Chip>golden trace</Chip>}
        <Chip>{agentLabel(run.agent)}</Chip>
        {task && (
          <Chip>
            {task.id} {task.title}
          </Chip>
        )}
        <Chip>seed {run.seed}</Chip>
        <Chip>
          {stepCount} steps · {fmtCompact(run.totalTokens)} tokens ·{' '}
          {(run.durationMs / 1000).toFixed(1)} s
        </Chip>
      </div>
      {task && (
        <p className="max-w-[80ch] text-sm text-muted">
          <b className="font-medium text-fg">Expected:</b> {task.expectedOutcome}
        </p>
      )}
    </div>
  )
}

const agentLabel = (a: AgentConfig) => `${a.modelLabel} · ${DESIGN_LABEL[a.agentDesign]}`

function TraceView({ run, manifest }: { run: Run; manifest: DatasetManifest }) {
  const [params, setParams] = useSearchParams()
  const last = run.steps.length - 1
  /**
   * The current step is React state, so every key press updates at once and
   * the next step is computed from the latest value. It is mirrored into the
   * URL (?step=7) so any position can be shared, and read back from the URL
   * on load. Driving it from the URL alone made fast key presses get lost:
   * URL updates are low-priority router transitions.
   */
  const [step, setStep] = useState(() => parseStep(params.get('step'), run.steps.length))
  const [playing, setPlaying] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle')

  // Everything derived from the trace is computed once per run, not per step.
  const states = useMemo(() => worldStates(run), [run])
  const failures = useMemo(() => failuresByStep(run), [run])
  const harmful = useMemo(() => harmfulChanges(run), [run])
  const changed = useMemo(() => changedPaths(run, step), [run, step])

  const go = useCallback(
    (next: number | ((current: number) => number)) =>
      setStep((s) => Math.max(0, Math.min(last, typeof next === 'function' ? next(s) : next))),
    [last],
  )

  // Mirror the step into the URL. The URL is an external system here, which is what effects are for.
  const urlStep = params.get('step')
  useEffect(() => {
    if (urlStep === String(step) || (urlStep === null && step === 0)) return
    setParams(
      (p) => {
        p.set('step', String(step))
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  }, [step, urlStep, setParams])

  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => {
      if (step >= last) setPlaying(false)
      else go(step + 1)
    }, PLAY_INTERVAL_MS)
    return () => clearTimeout(t)
  }, [playing, step, last, go])

  // Keyboard: ←/→ step, space plays or pauses, Home/End jump. Ignored while typing in a form field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, [contenteditable="true"]')) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setPlaying(false)
        go((s) => s + (e.key === 'ArrowRight' ? 1 : -1))
      } else if (e.key === ' ') {
        if (target.closest('button, a')) return // let space activate the focused control
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault()
        go(e.key === 'Home' ? 0 : last)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, last])

  const current = run.steps[step]!
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied('copied')
    } catch {
      setCopied('failed')
    }
  }
  const title =
    GOLDEN_COPY[run.id]?.title ?? manifest.tasks.find((t) => t.id === run.taskId)?.title ?? run.id
  const btn =
    'cursor-pointer rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm hover:bg-surface-2 disabled:cursor-default disabled:opacity-40'

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={`Replay: ${title}`} />
      <RunHeader run={run} manifest={manifest} title={title} />

      <section className="card flex flex-col gap-3 px-4 pt-3.5 pb-3" aria-label="Replay controls">
        <Timeline
          steps={run.steps}
          current={step}
          failures={failures}
          onSelect={(i) => (setPlaying(false), go(i))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btn}
            onClick={() => (setPlaying(false), go(0))}
            disabled={step === 0}
            aria-label="First step"
            title="First step (Home)"
          >
            ⏮
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => (setPlaying(false), go(step - 1))}
            disabled={step === 0}
            aria-label="Previous step"
            title="Previous step (←)"
          >
            ◀
          </button>
          <button
            type="button"
            className={`${btn} min-w-[88px]`}
            onClick={() => {
              if (!playing && step >= last) go(0)
              setPlaying((p) => !p)
            }}
            aria-label={playing ? 'Pause' : 'Play'}
            title="Play or pause (space)"
          >
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => (setPlaying(false), go(step + 1))}
            disabled={step === last}
            aria-label="Next step"
            title="Next step (→)"
          >
            ▶
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => (setPlaying(false), go(last))}
            disabled={step === last}
            aria-label="Last step"
            title="Last step (End)"
          >
            ⏭
          </button>
          <span className="ml-1 font-mono text-[13px] text-muted tabular-nums">
            Step {step} / {last}
          </span>
          <span className="flex-1" />
          <span className="hidden items-center gap-1.5 text-xs text-faint sm:inline-flex">
            <kbd className="rounded-sm border border-b-2 border-line-strong px-1.5 font-mono text-[11px]">
              ←
            </kbd>
            <kbd className="rounded-sm border border-b-2 border-line-strong px-1.5 font-mono text-[11px]">
              →
            </kbd>{' '}
            step
            <kbd className="rounded-sm border border-b-2 border-line-strong px-1.5 font-mono text-[11px]">
              space
            </kbd>{' '}
            play
          </span>
          <button type="button" className={btn} onClick={copyLink}>
            {copied === 'copied' ? 'Link copied' : 'Copy link to this step'}
          </button>
        </div>
        {copied === 'failed' && (
          <p className="font-mono text-xs text-faint">
            Copying is blocked here. The link is:{' '}
            <span className="text-fg select-all">{window.location.href}</span>
          </p>
        )}
        <TimelineLegend />
      </section>

      {/* One short announcement per step, instead of re-reading both panels to screen-reader users. */}
      <p className="sr-only" aria-live="polite">
        Step {step} of {last}: {STEP_LABEL[current.type]}
        {'tool' in current ? `, ${current.tool}` : ''}
        {current.type === 'tool_result' && current.injectedFault ? ', fault injected' : ''}
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="card flex min-w-0 flex-col" aria-label="Current step">
          <div className="flex items-center justify-between gap-2.5 rounded-t-md border-b border-line bg-raised px-3.5 py-2.5">
            <span className="inline-flex items-center gap-2 font-mono text-[12.5px]">
              {STEP_LABEL[current.type]}
              {'tool' in current ? ` · ${current.tool}` : ''}
            </span>
            <span className="font-mono text-xs text-faint tabular-nums">
              t = +{(current.tMs / 1000).toFixed(1)} s
              {'tokens' in current && current.tokens
                ? ` · ${current.tokens.input.toLocaleString('en-US')} in / ${current.tokens.output} out`
                : ''}
            </span>
          </div>
          <div className="p-3.5">
            <StepDetail step={current} failures={failures.get(step) ?? []} />
          </div>
        </section>
        <section className="card flex min-w-0 flex-col" aria-label="World state after this step">
          <div className="flex items-center justify-between gap-2.5 rounded-t-md border-b border-line bg-raised px-3.5 py-2.5">
            <span className="eyebrow">World state after this step</span>
            <span className="font-mono text-xs text-faint">now = {run.initialWorld.now}</span>
          </div>
          <div className="p-3.5">
            <WorldPanel world={states[step]!} changed={changed} harmful={harmful} step={step} />
          </div>
        </section>
      </div>

      <section className="card flex flex-col gap-2.5 px-3.5 py-3" aria-label="Grader verdicts">
        <span className="eyebrow">Grader verdicts · checked on the final state</span>
        <GraderStrip graders={run.graders} onJump={(n) => (setPlaying(false), go(n))} />
      </section>
    </div>
  )
}

function SummaryView({ summary, manifest }: { summary: RunSummary; manifest: DatasetManifest }) {
  const rows = use(loadRunIndex())
  const key = faultKey(summary.faults)
  // The run of the same agent, task and fault that does ship a trace (seed 1 in the mock data).
  const sibling = rows.find(
    (r) =>
      r.traced &&
      r.agentId === summary.agent.id &&
      r.taskId === summary.taskId &&
      r.faultKey === key,
  )
  const title = manifest.tasks.find((t) => t.id === summary.taskId)?.title ?? summary.id
  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={`Run: ${title}`} />
      <RunHeader run={summary} manifest={manifest} title={title} />
      <div className="flex max-w-[80ch] flex-col gap-1.5 rounded-md border border-line-strong bg-surface-2 px-4 py-3 text-sm">
        <span className="font-medium">No step-by-step trace for this run</span>
        <span className="text-muted">
          To keep the site small, this preview ships full traces for one seed per agent, task and
          fault. This run’s summary and grader results are below.
        </span>
        {sibling && (
          <Link to={`/runs/${encodeURIComponent(sibling.id)}`} className="self-start">
            Replay the same agent, task and fault (seed {sibling.seed}) →
          </Link>
        )}
      </div>
      <section className="card flex flex-col gap-2.5 px-3.5 py-3" aria-label="Grader verdicts">
        <span className="eyebrow">Grader verdicts · checked on the final state</span>
        <GraderStrip graders={summary.graders} />
      </section>
    </div>
  )
}
