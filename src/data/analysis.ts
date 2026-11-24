import {
  byAgent,
  byFaultKey,
  byTask,
  escalationCorrectness,
  injectionComplianceRate,
  meanSteps,
  exposureRate,
  recoveryRate,
  safetyViolationRate,
  successRate,
  tokensPerSuccess,
} from '../metrics/index.ts'
import type { Proportion } from '../metrics/index.ts'
import { faultKey } from '../schema/helpers.ts'
import type { FaultKey } from '../schema/helpers.ts'
import type { AgentConfig, FaultId, Outcome, RunSummary } from '../schema/index.ts'
import { computeFindings } from './findings.ts'
import type { Findings } from './findings.ts'
import type { Dataset } from './load.ts'

/**
 * Everything the overview pages show, computed once from the run summaries
 * with the shared metrics functions. Runs in the analysis worker, so the
 * main thread never parses or loops over 7,200 runs. The result is small
 * (one entry per agent × fault) and is sent back as plain data.
 */

/** One matrix cell: one agent config under one fault setting. */
export interface MatrixCell {
  success: Proportion | null
  safety: Proportion | null
  /** Recovery paired by task vs this agent's baseline; null for the baseline column itself. */
  recovery: Proportion | null
  /** Share of runs where the fault reached the agent; null on simulated data and the baseline. */
  exposure: Proportion | null
  counts: Record<Outcome, number>
}

/** One leaderboard row. `scope` decides which runs the fault-dependent columns use. */
export interface LeaderboardRow {
  agent: AgentConfig
  baseline: Proportion | null
  /** Success with faults on: pooled over every fault (scope "all") or one fault. */
  underFaults: Proportion | null
  /** Safety violations: every run (scope "all", baseline included) or one fault's runs. */
  safety: Proportion | null
  /** Always over the prompt_injection runs, whatever the scope. */
  injection: Proportion | null
  /** Always over every run. */
  escalation: Proportion | null
  tokensPerSuccess: number | null
  meanSteps: number | null
}

/** "all" or a single fault id. */
export type LeaderboardScope = 'all' | FaultId

export interface Analysis {
  findings: Findings
  /** Agent configs in manifest order. */
  agents: AgentConfig[]
  /** Fault settings in manifest order, baseline ("none") first. */
  faultKeys: FaultKey[]
  /** matrix[agentId][faultKey] */
  matrix: Record<string, Record<string, MatrixCell>>
  /** leaderboard[scope], rows in manifest order (the page sorts them). */
  leaderboard: Record<string, LeaderboardRow[]>
  /** tasks[taskId]: how every agent config did on this task, pooled. */
  tasks: Record<string, TaskStats>
}

/** Per-task rates for the task catalog, pooled over every agent config. */
export interface TaskStats {
  baseline: Proportion | null
  underFaults: Proportion | null
  safety: Proportion | null
  runCount: number
}

function countOutcomes(runs: RunSummary[]): Record<Outcome, number> {
  const counts = { success: 0, failure: 0, unsafe: 0 }
  for (const r of runs) counts[r.outcome]++
  return counts
}

export function computeAnalysis(dataset: Dataset): Analysis {
  const { manifest, runs } = dataset
  const faultKeys = manifest.faultSettings.map((spec) => faultKey(spec))
  const singleFaults = manifest.faultSettings.flatMap((spec) =>
    spec.length === 1 ? [spec[0]!.id] : [],
  )
  const runsByAgent = byAgent(runs)

  const matrix: Analysis['matrix'] = {}
  const leaderboard: Analysis['leaderboard'] = { all: [] }
  for (const f of singleFaults) leaderboard[f] = []

  for (const agent of manifest.agents) {
    const agentRuns = runsByAgent.get(agent.id) ?? []
    const byFault = byFaultKey(agentRuns)
    const cellRuns = (key: FaultKey) => byFault.get(key) ?? []

    matrix[agent.id] = {}
    for (const key of faultKeys) {
      const cr = cellRuns(key)
      const single = !key.includes('+') && key !== 'none' ? (key as FaultId) : null
      matrix[agent.id]![key] = {
        success: successRate(cr),
        safety: safetyViolationRate(cr),
        recovery: single ? recoveryRate(agentRuns, single) : null,
        exposure: exposureRate(cr),
        counts: countOutcomes(cr),
      }
    }

    const baseline = successRate(cellRuns('none'))
    const injection = injectionComplianceRate(agentRuns)
    const escalation = escalationCorrectness(agentRuns)
    const withFaults = agentRuns.filter((r) => r.faults.length > 0)
    leaderboard.all!.push({
      agent,
      baseline,
      underFaults: successRate(withFaults),
      safety: safetyViolationRate(agentRuns),
      injection,
      escalation,
      tokensPerSuccess: tokensPerSuccess(withFaults),
      meanSteps: meanSteps(withFaults),
    })
    for (const f of singleFaults) {
      const scoped = cellRuns(f)
      leaderboard[f]!.push({
        agent,
        baseline,
        underFaults: successRate(scoped),
        safety: safetyViolationRate(scoped),
        injection,
        escalation,
        tokensPerSuccess: tokensPerSuccess(scoped),
        meanSteps: meanSteps(scoped),
      })
    }
  }

  const tasks: Analysis['tasks'] = {}
  const runsByTask = byTask(runs)
  for (const task of manifest.tasks) {
    const taskRuns = runsByTask.get(task.id) ?? []
    tasks[task.id] = {
      baseline: successRate(taskRuns.filter((r) => r.faults.length === 0)),
      underFaults: successRate(taskRuns.filter((r) => r.faults.length > 0)),
      safety: safetyViolationRate(taskRuns),
      runCount: taskRuns.length,
    }
  }

  return {
    findings: computeFindings(dataset),
    agents: manifest.agents,
    faultKeys,
    matrix,
    leaderboard,
    tasks,
  }
}
