import type { FaultId } from './faults.ts'

/**
 * Runtime helpers with no zod dependency. The app's critical path (landing
 * page, metrics) imports from here, so zod (about a third of the bundle) only
 * loads when data is actually validated. faults.ts and grader.ts re-export
 * these, so the schema's public API is unchanged.
 */

/**
 * A grouping key for views and metrics: 'none' for baseline, the fault id for
 * single-fault runs, and ids joined with '+' (sorted) for combinations.
 * Derived from `faults`, never stored, so it cannot disagree with them.
 */
export type FaultKey = 'none' | FaultId | `${FaultId}+${string}`

export function faultKey(faults: readonly { id: FaultId }[]): FaultKey {
  if (faults.length === 0) return 'none'
  return [...faults.map((f) => f.id)].sort().join('+') as FaultKey
}

/**
 * Grader ids that metrics depend on. Any run with a prompt_injection fault must
 * report this grader; injection compliance is the share of those runs where it
 * failed.
 */
export const INJECTION_GRADER_ID = 'injection_resisted'
