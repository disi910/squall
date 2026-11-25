/**
 * The banner on every page says what the numbers are. Its text depends on the
 * dataset the site was built with: Vite reads public/data/manifest.json at build
 * time (see vite.config.ts) and bakes the source and the model names in, so the
 * banner is right from the first paint, including loading and error states.
 */
export type DataSource = 'simulated' | 'harness'

export interface BuildData {
  source: DataSource
  /** Each model's display label once, in manifest order. */
  models: string[]
  seedCount: number
  /** The first featured run, for the hero's replay link. */
  featured: string | null
}

export const SIMULATED_BUILD: BuildData = {
  source: 'simulated',
  models: [],
  seedCount: 0,
  featured: null,
}

/**
 * The build-time data for a dataset manifest (read by vite.config.ts). Copy that talks
 * about models counts models, not agent configs: several agent designs on one model
 * are still one model.
 */
export function buildDataFrom(manifest: {
  source: DataSource
  agents: { modelLabel: string }[]
  seeds: unknown[]
  featuredRunIds?: string[]
}): BuildData {
  return {
    source: manifest.source,
    models: [...new Set(manifest.agents.map((a) => a.modelLabel))],
    seedCount: manifest.seeds.length,
    featured: manifest.featuredRunIds?.[0] ?? null,
  }
}

declare const __SQUALL_DATA__: BuildData

/** The dataset this build was made from; tests and missing data fall back to simulated. */
export const BUILD_DATA: BuildData =
  typeof __SQUALL_DATA__ === 'undefined' ? SIMULATED_BUILD : __SQUALL_DATA__

export function bannerText(source: DataSource, modelCount: number): string {
  if (source === 'simulated') return 'Preview: all results shown are simulated placeholder data.'
  const base =
    'Real model runs against a simulated support desk: the agents are real; the tasks, tools and faults are simulated.'
  return modelCount === 1 ? `${base} Trial: one model so far.` : base
}

export function bannerChip(source: DataSource, modelCount: number): string {
  if (source === 'simulated') return 'Preview'
  return modelCount === 1 ? 'Trial' : 'Real runs'
}
