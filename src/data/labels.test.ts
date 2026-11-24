import { describe, expect, it } from 'vitest'
import { wrapLabel } from './labels.ts'

describe('wrapLabel', () => {
  it('keeps a short name on one line', () => {
    expect(wrapLabel('Model A')).toEqual(['Model A'])
  })
  it('wraps a long model name onto two lines at a space', () => {
    expect(wrapLabel('Claude Haiku 5.5')).toEqual(['Claude Haiku', '5.5'])
    expect(wrapLabel('Claude Sonnet 5.5')).toEqual(['Claude', 'Sonnet 5.5'])
  })
})
