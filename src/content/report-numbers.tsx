import { Suspense, use } from 'react'
import type { ComponentType } from 'react'
import { ciRange, pct } from '../data/format.ts'
import { agentName, faultLabel } from '../data/labels.ts'
import { loadAnalysis, loadManifest } from '../data/load.ts'
import { wilson } from '../metrics/index.ts'
import type { Proportion } from '../metrics/index.ts'
import type { AgentDesign } from '../schema/index.ts'

/**
 * Live numbers for report.mdx. The prose is static, but every figure in it is
 * computed from the runs at load time, like everywhere else on the site
 * (HANDOFF §10). Each number has its own Suspense boundary, so the text
 * renders at once and the figures fill in when the analysis arrives.
 */

/** Gives a data-reading component its own Suspense boundary. */
function Live({ value: Value }: { value: ComponentType }) {
  return (
    <Suspense fallback={<span className="text-faint">…</span>}>
      <Value />
    </Suspense>
  )
}

/** "84% (95% CI 81–86)" */
function RateText({ p }: { p: Proportion | null }) {
  if (!p) return <span>n/a</span>
  return (
    <span className="tabular-nums">
      <strong className="font-medium text-fg">{pct(p.rate)}</strong>{' '}
      <span className="font-mono text-[0.85em] text-faint">(95% CI {ciRange(p)})</span>
    </span>
  )
}

const useFindings = () => use(loadAnalysis()).findings

function DatasetScaleValue() {
  const m = use(loadManifest())
  const { runCount } = useFindings()
  return (
    <>
      {m.agents.length} agent configs × {m.faultSettings.length} fault settings × {m.tasks.length}{' '}
      tasks × {m.seeds.length} seeds = {runCount.toLocaleString('en-US')} runs
    </>
  )
}

function CellSizeValue() {
  const m = use(loadManifest())
  return <>{m.tasks.length * m.seeds.length}</>
}

function BaselineSuccessValue() {
  const base = useFindings().successByFault.find((d) => d.key === 'none')
  return <RateText p={base?.rate ?? null} />
}

function HardestFaultValue() {
  const worst = useFindings()
    .successByFault.filter((d) => d.key !== 'none')
    .sort((a, b) => a.rate.rate - b.rate.rate)[0]
  if (!worst) return <>n/a</>
  return (
    <>
      {faultLabel(worst.key).toLowerCase()}, where success drops to <RateText p={worst.rate} />
    </>
  )
}

function VerifierOnSilentFailureValue() {
  const v = useFindings().verifierOnSilentFailure
  if (!v) return <>n/a</>
  return (
    <>
      <RateText p={v.verifier} /> for the verifier design vs <RateText p={v.react} /> for plain
      ReAct
    </>
  )
}

function MostInjectableValue() {
  const m = useFindings().mostInjectable
  if (!m) return <>n/a</>
  const rows = use(loadAnalysis()).leaderboard.all ?? []
  if (m.rate.rate === 0 && rows.length > 1) {
    const n = rows.reduce((sum, r) => sum + (r.injection?.n ?? 0), 0)
    return (
      <>
        none of the {rows.length} agent configs followed the injected instruction in any of their{' '}
        {n} prompt-injection runs
      </>
    )
  }
  return (
    <>
      {agentName(m.agent)}, which followed the injected instruction in <RateText p={m.rate} /> of
      its prompt-injection runs
    </>
  )
}

function ExposureValue() {
  return <RateText p={useFindings().exposure} />
}

type DesignRateProps = { design: AgentDesign; metric: 'baseline' | 'underFaults' }

/** One design's baseline success or success with faults on, pooled over models. */
function DesignRateValue({ design, metric }: DesignRateProps) {
  const rows = (use(loadAnalysis()).leaderboard.all ?? []).filter(
    (r) => r.agent.agentDesign === design,
  )
  const parts = rows.map((r) => r[metric]).filter((p): p is Proportion => p !== null)
  const p = parts.length
    ? wilson(
        parts.reduce((sum, q) => sum + q.successes, 0),
        parts.reduce((sum, q) => sum + q.n, 0),
      )
    : null
  return <RateText p={p} />
}

export const DesignRate = (props: DesignRateProps) => (
  <Suspense fallback={<span className="text-faint">…</span>}>
    <DesignRateValue {...props} />
  </Suspense>
)

export const DatasetScale = () => <Live value={DatasetScaleValue} />
export const Exposure = () => <Live value={ExposureValue} />
export const CellSize = () => <Live value={CellSizeValue} />
export const BaselineSuccess = () => <Live value={BaselineSuccessValue} />
export const HardestFault = () => <Live value={HardestFaultValue} />
export const VerifierOnSilentFailure = () => <Live value={VerifierOnSilentFailureValue} />
export const MostInjectable = () => <Live value={MostInjectableValue} />
