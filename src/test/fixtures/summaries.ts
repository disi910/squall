import { RunSummary, SCHEMA_VERSION } from '../../schema/index.ts'
import type {
  AgentDesign,
  DatasetManifest,
  FaultId,
  GraderResult,
  Outcome,
} from '../../schema/index.ts'

export interface SummaryOpts {
  agent?: string
  design?: AgentDesign
  task?: string
  seed?: number
  faults?: FaultId[]
  outcome?: Outcome
  followedInjection?: boolean
  steps?: number
  tokens?: number
  escalated?: boolean
  escalationExpected?: boolean
}

/** Builds a schema-valid summary; graders are derived from the outcome so the data stays consistent. */
export function makeSummary(o: SummaryOpts = {}): RunSummary {
  const outcome = o.outcome ?? 'success'
  const graders: GraderResult[] = [
    { graderId: 'task_done', severity: 'task', passed: outcome === 'success', detail: '' },
    {
      graderId: 'no_bad_side_effects',
      severity: 'safety',
      passed: outcome !== 'unsafe' || o.followedInjection === true,
      detail: '',
    },
  ]
  if (o.faults?.includes('prompt_injection'))
    graders.push({
      graderId: 'injection_resisted',
      severity: 'safety',
      passed: !o.followedInjection,
      detail: '',
    })
  const summary: RunSummary = {
    schemaVersion: SCHEMA_VERSION,
    id: `${o.agent ?? 'x'}-${o.task ?? 'T1'}-${o.seed ?? 1}-${(o.faults ?? []).join('+')}`,
    agent: { id: o.agent ?? 'x', modelLabel: 'Model X', agentDesign: o.design ?? 'react' },
    taskId: o.task ?? 'T1',
    faults: (o.faults ?? []).map((id) => ({ id })),
    seed: o.seed ?? 1,
    outcome,
    graders,
    totalTokens: o.tokens ?? 1000,
    durationMs: 1000,
    escalated: o.escalated ?? false,
    escalationExpected: o.escalationExpected ?? false,
    stepCount: o.steps ?? 10,
  }
  // Guard against a test helper that silently produces invalid data.
  RunSummary.parse(summary)
  return summary
}

/** A manifest matching summaries built with makeSummary, for UI and findings tests. */
export function makeManifest(agents: { id: string; design: AgentDesign }[]): DatasetManifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    source: 'simulated',
    generator: { name: 'test', version: '0' },
    agents: agents.map((a) => ({ id: a.id, modelLabel: 'Model X', agentDesign: a.design })),
    tasks: [
      {
        id: 'T1',
        category: 'refund',
        title: 'Test task',
        description: 'd',
        expectedOutcome: 'e',
        expectedAction: 'refund',
      },
    ],
    faultSettings: [[], [{ id: 'silent_failure' }], [{ id: 'prompt_injection' }]],
    seeds: [1],
    runCount: 0,
    files: { summaries: 'runs.json', traceTemplate: 'traces/{runId}.json' },
    tracedRunIds: [],
    goldenRunIds: [],
  }
}
