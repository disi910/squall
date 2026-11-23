import { faultKey } from '../schema/index.ts'
import type { FaultKey, RunSummary } from '../schema/index.ts'

/** Groups runs by a key, keeping first-seen order. */
export function groupBy<K>(
  runs: readonly RunSummary[],
  keyOf: (r: RunSummary) => K,
): Map<K, RunSummary[]> {
  const groups = new Map<K, RunSummary[]>()
  for (const r of runs) {
    const k = keyOf(r)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  return groups
}

export const byAgent = (runs: readonly RunSummary[]) => groupBy(runs, (r) => r.agent.id)
export const byFaultKey = (runs: readonly RunSummary[]) =>
  groupBy<FaultKey>(runs, (r) => faultKey(r.faults))
export const byTask = (runs: readonly RunSummary[]) => groupBy(runs, (r) => r.taskId)
