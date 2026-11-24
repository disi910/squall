/**
 * The banner on every page says what the numbers are. Its text depends on the
 * dataset the site was built with: Vite reads public/data/manifest.json at build
 * time (see vite.config.ts) and bakes the source and agent count in, so the banner
 * is right from the first paint, including loading and error states.
 */
export type DataSource = 'simulated' | 'harness'

interface BuildData {
  source: DataSource
  agentCount: number
  /** The first featured run, for the hero's replay link. */
  featured: string | null
}

declare const __SQUALL_DATA__: BuildData

/** The dataset this build was made from; tests and missing data fall back to simulated. */
export const BUILD_DATA: BuildData =
  typeof __SQUALL_DATA__ === 'undefined'
    ? { source: 'simulated', agentCount: 0, featured: null }
    : __SQUALL_DATA__

export function bannerText(source: DataSource, agentCount: number): string {
  if (source === 'simulated') return 'Preview: all results shown are simulated placeholder data.'
  const base =
    'Real model runs against a simulated support desk: the agents are real; the tasks, tools and faults are simulated.'
  return agentCount === 1 ? `${base} Trial: one model so far.` : base
}

export function bannerChip(source: DataSource, agentCount: number): string {
  if (source === 'simulated') return 'Preview'
  return agentCount === 1 ? 'Trial' : 'Real runs'
}
