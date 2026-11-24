import type { DataSource } from './banner.ts'

/**
 * Wording that depends on whether the site shows simulated data or real harness
 * runs. Kept in one place so every page says the same thing, and so the mock data
 * keeps its "example" framing while real data is presented as observations.
 */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function copyFor(source: DataSource) {
  const real = source === 'harness'
  return {
    findingsTitle: real ? 'Findings' : 'Example findings',
    findingsNote: real
      ? 'Observed in the trial runs. One model and one seed so far: read these as observations, not conclusions.'
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
    agentStep: real
      ? 'A real model (Claude Haiku 5.5 so far) runs a ReAct loop over the shop’s tools.'
      : 'ReAct, plan-and-execute, or ReAct with a verifier step, on three placeholder models.',
    leaderboardIntro: (agents: number) =>
      real
        ? `${plural(agents, 'agent config')}: real models running a ReAct agent.`
        : `${plural(agents, 'agent config')}: placeholder models × agent designs.`,
    runsIntro: real ? 'Every run, filterable.' : 'Every simulated run, filterable.',
    footer: real
      ? 'Squall. Nordlys Supply is a fictional shop; its tools and faults are simulated, the agents are real models.'
      : 'Squall preview. Nordlys Supply is a fictional shop. Model names are placeholders, not real models.',
    footerTag: real ? 'real model runs' : 'simulated data',
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
