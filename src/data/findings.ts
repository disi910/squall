import {
  byAgent,
  byFaultKey,
  exposureRate,
  injectionComplianceRate,
  meanSteps,
  successRate,
} from '../metrics/index.ts'
import type { Proportion } from '../metrics/index.ts'
import { faultKey } from '../schema/helpers.ts'
import type { AgentConfig, FaultKey, RunSummary } from '../schema/index.ts'
import type { Dataset } from './load.ts'

/**
 * The landing page's headline numbers. Computed from the runs on every load,
 * never typed in, so they change when the data changes (HANDOFF §10).
 */
export interface Findings {
  /** The agent config most likely to follow an injected instruction. */
  mostInjectable: { agent: AgentConfig; rate: Proportion } | null
  /** Success under silent_failure for the verifier design vs plain ReAct, pooled over models. */
  verifierOnSilentFailure: { verifier: Proportion; react: Proportion } | null
  /** Mean steps of failed or unsafe runs vs successful runs. */
  steps: { failed: number; succeeded: number } | null
  /** Share of fault runs where the fault reached the agent (harness data only). */
  exposure: Proportion | null
  /** The single fault with the lowest pooled success rate. */
  hardestFault: { key: FaultKey; rate: Proportion } | null
  /** Success rate per fault setting, pooled over every agent, in manifest order. */
  successByFault: { key: FaultKey; rate: Proportion }[]
  runCount: number
}

const onlyFault = (runs: RunSummary[], key: FaultKey) => byFaultKey(runs).get(key) ?? []

export function computeFindings({ manifest, runs }: Dataset): Findings {
  let mostInjectable: Findings['mostInjectable'] = null
  for (const [agentId, agentRuns] of byAgent(runs)) {
    const rate = injectionComplianceRate(agentRuns)
    const agent = manifest.agents.find((a) => a.id === agentId)
    if (rate && agent && (!mostInjectable || rate.rate > mostInjectable.rate.rate))
      mostInjectable = { agent, rate }
  }

  const silent = onlyFault(runs, 'silent_failure')
  const verifier = successRate(silent.filter((r) => r.agent.agentDesign === 'react_with_verifier'))
  const react = successRate(silent.filter((r) => r.agent.agentDesign === 'react'))

  const failed = meanSteps(runs.filter((r) => r.outcome !== 'success'))
  const succeeded = meanSteps(runs.filter((r) => r.outcome === 'success'))

  const grouped = byFaultKey(runs)
  const successByFault = manifest.faultSettings.flatMap((spec) => {
    const key = faultKey(spec)
    const rate = successRate(grouped.get(key) ?? [])
    return rate ? [{ key, rate }] : []
  })

  const hardestFault =
    successByFault
      .filter((d) => d.key !== 'none' && !d.key.includes('+'))
      .sort((a, b) => a.rate.rate - b.rate.rate)[0] ?? null

  return {
    mostInjectable,
    exposure: exposureRate(runs),
    hardestFault,
    verifierOnSilentFailure: verifier && react ? { verifier, react } : null,
    steps: failed !== null && succeeded !== null ? { failed, succeeded } : null,
    successByFault,
    runCount: runs.length,
  }
}
