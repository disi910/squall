import type { Outcome, RunSummary } from '../schema/index.ts'
import { faultKey } from '../schema/helpers.ts'
import type { FaultKey } from '../schema/helpers.ts'
import { computeAnalysis } from './analysis.ts'
import type { Analysis } from './analysis.ts'
import type { Dataset } from './load.ts'

/**
 * What the data worker can be asked. The handler is a pure function of the
 * dataset, so the worker and the main-thread fallback share it exactly.
 */

/** One row of the run explorer: just what the table shows and filters on. */
export interface RunRow {
  id: string
  agentId: string
  taskId: string
  faultKey: FaultKey
  seed: number
  outcome: Outcome
  stepCount: number
  totalTokens: number
  /** Whether a full trace file ships for this run. */
  traced: boolean
}

export type DataRequest =
  { kind: 'analysis' } | { kind: 'runIndex' } | { kind: 'summary'; runId: string }

export interface DataResponses {
  analysis: Analysis
  runIndex: RunRow[]
  summary: RunSummary | null
}

export function buildRunIndex({ manifest, runs }: Dataset): RunRow[] {
  const traced = new Set(manifest.tracedRunIds)
  return runs.map((r) => ({
    id: r.id,
    agentId: r.agent.id,
    taskId: r.taskId,
    faultKey: faultKey(r.faults),
    seed: r.seed,
    outcome: r.outcome,
    stepCount: r.stepCount,
    totalTokens: r.totalTokens,
    traced: traced.has(r.id),
  }))
}

export function handleRequest(
  dataset: Dataset,
  req: DataRequest,
): DataResponses[DataRequest['kind']] {
  switch (req.kind) {
    case 'analysis':
      return computeAnalysis(dataset)
    case 'runIndex':
      return buildRunIndex(dataset)
    case 'summary':
      return dataset.runs.find((r) => r.id === req.runId) ?? null
  }
}
