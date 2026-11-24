// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeRun } from '../../test/fixtures/minimal-run.ts'
import { Timeline } from './Timeline.tsx'

afterEach(cleanup)

/** jsdom has no layout, so give the scroller and the step buttons fixed geometry. */
function layout(scroller: HTMLElement) {
  Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 100 })
  Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: 400 })
  scroller.querySelectorAll('button').forEach((b, i) => {
    Object.defineProperty(b, 'offsetLeft', { configurable: true, value: i * 27 })
    Object.defineProperty(b, 'offsetWidth', { configurable: true, value: 24 })
  })
}

describe('Timeline', () => {
  it('scrolls the selected step into view without scrolling the page', async () => {
    const steps = makeRun().steps
    const { rerender } = render(
      <Timeline steps={steps} current={0} failures={new Map()} onSelect={() => {}} />,
    )
    const scroller = screen.getByRole('group').parentElement!
    layout(scroller)
    const last = steps.length - 1
    await act(async () => {
      rerender(<Timeline steps={steps} current={last} failures={new Map()} onSelect={() => {}} />)
    })
    expect(scroller.scrollLeft).toBe(last * 27 + 24 + 12 - 100)
  })
})
