import { describe, expect, it } from 'vitest'
import { fadeFor, scrollLeftToReveal } from './scroll.ts'

describe('fadeFor', () => {
  it('fades nothing when everything fits', () => {
    expect(fadeFor(0, 300, 300)).toBeNull()
  })
  it('fades the right edge at the start of an overflowing row', () => {
    expect(fadeFor(0, 600, 300)).toBe('right')
  })
  it('fades both edges in the middle and only the left at the end', () => {
    expect(fadeFor(100, 600, 300)).toBe('both')
    expect(fadeFor(300, 600, 300)).toBe('left')
  })
})

describe('scrollLeftToReveal', () => {
  it('leaves a visible item alone', () => {
    expect(scrollLeftToReveal(50, 24, 0, 300)).toBeNull()
  })
  it('scrolls right to reveal an item past the right edge, with a small margin', () => {
    expect(scrollLeftToReveal(400, 24, 0, 300)).toBe(400 + 24 + 12 - 300)
  })
  it('scrolls left to reveal an item before the left edge', () => {
    expect(scrollLeftToReveal(10, 24, 200, 300)).toBe(0)
  })
})
