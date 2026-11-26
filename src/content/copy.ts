import { pct } from '../data/format.ts'
import { DESIGN_LABEL } from '../data/labels.ts'
import type { DataSource } from './banner.ts'

/**
 * Wording that depends on whether the site shows simulated data or real harness
 * runs. Kept in one place so every page says the same thing, and so the mock data
 * keeps its "example" framing while real data is presented as observations.
 */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "A", "A and B", "A, B and C"; past three, just the count. */
function modelList(models: string[]): string {
  if (models.length > 3) return `${models.length} of them`
  return listOf(models)
}

/** "A", "A and B", "A, B and C". */
const listOf = (items: string[]) =>
  items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

const designLabel = (d: string) => (DESIGN_LABEL as Record<string, string>)[d] ?? d
const onlyReAct = (designs: string[]) => designs.length === 0 || designs.join() === 'react'

export function copyFor(source: DataSource) {
  const real = source === 'harness'
  return {
    findingsTitle: real ? 'Findings' : 'Example findings',
    findingsNote: (models: number, seeds: number) =>
      real
        ? `Observed in the trial runs: ${models === 1 ? 'one model' : `${models} models`} and ${seeds === 1 ? 'one seed' : `${seeds} seeds`} per setting so far. Read these as observations, not conclusions.`
        : 'Hypothetical. Computed from the simulated runs to show the format.',
    findingEyebrow: (topic: string) => `${real ? 'Finding' : 'Example finding'} · ${topic}`,
    chartCaption: real
      ? 'Bars show the success rate; whiskers show the 95% Wilson interval.'
      : 'Bars show the success rate; whiskers show the 95% Wilson interval. Simulated data.',
    datasetLine: (runs: number, agents: number, faults: number, tasks: number, seeds: number) =>
      [
        `${runs.toLocaleString('en-US')} ${real ? 'runs' : 'simulated runs'}`,
        plural(agents, 'agent config'),
        plural(faults, 'fault setting'),
        plural(tasks, 'task'),
        plural(seeds, 'seed'),
      ].join(' · '),
    agentStep: (models: string[], designs: string[] = ['react']) => {
      if (!real)
        return 'ReAct, plan-and-execute, or ReAct with a verifier step, on three placeholder models.'
      const subject = `${models.length > 1 ? 'Real models' : 'A real model'}${models.length ? ` (${modelList(models)})` : ''} ${models.length > 1 ? 'run' : 'runs'}`
      return onlyReAct(designs)
        ? `${subject} a ReAct loop over the shop’s tools.`
        : `${subject} as ${designs.length} reference agents over the shop’s tools: ${listOf(designs.map(designLabel))}.`
    },
    leaderboardIntro: (agents: number, designs: string[] = ['react']) =>
      real
        ? `${plural(agents, 'agent config')}: real models running ${onlyReAct(designs) ? 'a ReAct agent' : `${designs.length} reference agent designs`}.`
        : `${plural(agents, 'agent config')}: placeholder models × agent designs.`,
    runsIntro: real ? 'Every run, filterable.' : 'Every simulated run, filterable.',
    footer: real
      ? 'Squall. Nordlys Supply is a fictional shop; its tools and faults are simulated, the agents are real models.'
      : 'Squall preview. Nordlys Supply is a fictional shop. Model names are placeholders, not real models.',
    footerTag: real ? 'real model runs' : 'simulated data',
    goldenNote: real ? '' : 'The hand-written golden traces are excluded from all metrics.',
  }
}

/** The steps finding, worded by the actual direction of the difference. */
export function stepsSentence(failed: number, succeeded: number): string {
  const counts = `(${failed.toFixed(1)} vs ${succeeded.toFixed(1)} on average)`
  if (Math.abs(failed - succeeded) < 1)
    return `Failed and unsafe runs take about as many steps as successful ones ${counts}.`
  return failed > succeeded
    ? `Failed and unsafe runs take more steps than successful ones ${counts}.`
    : `Failed and unsafe runs take fewer steps than successful ones ${counts}.`
}

/**
 * The verifier finding, worded by the actual direction of the difference and
 * by how many models it pools over.
 */
export function verifierSentence(react: number, verifier: number, models: string[]): string {
  const where =
    models.length > 1 ? ', pooled over models' : models.length === 1 ? ` on ${models[0]}` : ''
  const gap = Math.round((verifier - react) * 100)
  if (gap === 0)
    return `A verifier step leaves success under silent failure unchanged${where} (${pct(react)} vs ${pct(verifier)}).`
  const verb = gap > 0 ? 'lifts' : 'lowers'
  return `A verifier step ${verb} success under silent failure from ${pct(react)} to ${pct(verifier)}${where}.`
}
