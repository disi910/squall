import { describe, expect, it } from 'vitest'
import { makeRun } from '../test/fixtures/minimal-run.ts'
import {
  changedPaths,
  failuresByStep,
  faultSteps,
  harmfulChanges,
  parseStep,
  worldStates,
} from './replay.ts'

// The fixture: refunds.issue is called at step 8 and its result (with the world diff) lands at step 9;
// the reply's diff lands at step 11; the timeout fault hits the result at step 4.

describe('worldStates', () => {
  const run = makeRun()
  const states = worldStates(run)

  it('has one state per step', () => {
    expect(states).toHaveLength(run.steps.length)
  })

  it('applies each diff at the step where it was recorded, not before', () => {
    expect(states[8]!.refunds).toEqual({})
    expect(states[9]!.refunds['R-901']).toMatchObject({ orderId: '4402', amount: 289 })
    expect(states[9]!.orders['4402']!.status).toBe('refunded')
    expect(states[10]!.tickets['TK-2081']!.status).toBe('open')
    expect(states[11]!.tickets['TK-2081']!.status).toBe('replied')
  })

  it('does not mutate the trace', () => {
    expect(run.initialWorld.refunds).toEqual({})
  })
})

describe('changedPaths', () => {
  it('splits changes into this step and earlier steps', () => {
    const { now, earlier } = changedPaths(makeRun(), 11)
    expect([...now]).toEqual(['/tickets/TK-2081/status', '/tickets/TK-2081/replies'])
    expect(earlier.has('/refunds/R-901')).toBe(true)
    expect(earlier.has('/tickets/TK-2081/status')).toBe(false)
  })
})

describe('failures and harmful changes', () => {
  it('finds nothing in a clean run', () => {
    const run = makeRun()
    expect(failuresByStep(run).size).toBe(0)
    expect(harmfulChanges(run).size).toBe(0)
  })

  it('maps a failed safety grader on a call to the world changes of its result', () => {
    const run = makeRun()
    run.graders[2] = { ...run.graders[2]!, passed: false, failedAtStep: 8 }
    expect(
      failuresByStep(run)
        .get(8)
        ?.map((g) => g.graderId),
    ).toEqual(['no_unauthorized_refund'])
    const harmful = harmfulChanges(run)
    expect(harmful.get('/refunds/R-901')).toBe(9)
    expect(harmful.get('/orders/4402/status')).toBe(9)
    expect(harmful.has('/tickets/TK-2081/status')).toBe(false)
  })

  it('ignores task graders when marking harmful changes', () => {
    const run = makeRun()
    run.graders[0] = { ...run.graders[0]!, passed: false, failedAtStep: 8 }
    expect(harmfulChanges(run).size).toBe(0)
  })

  it('lists the steps the fault layer touched', () => {
    expect(faultSteps(makeRun())).toEqual([4])
  })
})

describe('parseStep', () => {
  it('clamps to the trace and treats junk as 0', () => {
    expect(parseStep('7', 13)).toBe(7)
    expect(parseStep('99', 13)).toBe(12)
    expect(parseStep('-3', 13)).toBe(0)
    expect(parseStep('abc', 13)).toBe(0)
    expect(parseStep(null, 13)).toBe(0)
  })
})
