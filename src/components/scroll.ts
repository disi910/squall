import { useEffect, useRef } from 'react'

/**
 * Horizontal scroll helpers. On narrow screens the nav, the tables, the matrix and
 * the replay timeline scroll sideways; without a cue their content looks cut off.
 * A fade on the side that still has content hidden is that cue.
 */
export type Fade = 'left' | 'right' | 'both'

/** Which edges have hidden content, given the scroll position and sizes. */
export function fadeFor(scrollLeft: number, scrollWidth: number, clientWidth: number): Fade | null {
  const hiddenLeft = scrollLeft > 1
  const hiddenRight = scrollLeft + clientWidth < scrollWidth - 1
  if (hiddenLeft && hiddenRight) return 'both'
  if (hiddenLeft) return 'left'
  if (hiddenRight) return 'right'
  return null
}

/** The scrollLeft that brings an item into view (with a small margin), or null if it is visible. */
export function scrollLeftToReveal(
  itemLeft: number,
  itemWidth: number,
  viewLeft: number,
  viewWidth: number,
  margin = 12,
): number | null {
  if (itemLeft < viewLeft) return Math.max(0, itemLeft - margin)
  if (itemLeft + itemWidth > viewLeft + viewWidth) return itemLeft + itemWidth + margin - viewWidth
  return null
}

/**
 * Keeps `data-fade` on a scroll container in sync with its hidden edges; the CSS in
 * index.css fades those edges. Nothing changes where the content fits.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const fade = fadeFor(el.scrollLeft, el.scrollWidth, el.clientWidth)
      if (fade) el.dataset.fade = fade
      else delete el.dataset.fade
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    if (el.firstElementChild) observer?.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [])
  return ref
}
