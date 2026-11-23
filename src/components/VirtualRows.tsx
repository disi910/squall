import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

interface VirtualRowsProps<T> {
  items: T[]
  rowHeight: number
  /** Height of the scroll area in px; used both for the CSS and to work out what is visible. */
  viewportHeight: number
  /** Rendered beyond each edge of the viewport, so fast scrolling does not show blank rows. */
  overscan?: number
  renderRow: (item: T, index: number, style: CSSProperties) => ReactNode
  className?: string
}

/**
 * A fixed-row-height virtual list: only rows in (or near) the viewport are in
 * the DOM, so 7,200 runs scroll as smoothly as 20. Fixed heights keep the
 * maths trivial: row i sits at i × rowHeight, and the spacer makes the
 * scrollbar the right size. Remount it (change its key) to reset the scroll.
 */
export function VirtualRows<T>({
  items,
  rowHeight,
  viewportHeight,
  overscan = 8,
  renderRow,
  className = '',
}: VirtualRowsProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
  const last = Math.min(
    items.length,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
  )

  return (
    <div
      role="rowgroup"
      className={`relative overflow-y-auto ${className}`}
      style={{ height: `min(${viewportHeight}px, 70vh)` }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(first, last).map((item, i) => {
          const index = first + i
          return renderRow(item, index, {
            position: 'absolute',
            top: index * rowHeight,
            height: rowHeight,
            left: 0,
            right: 0,
          })
        })}
      </div>
    </div>
  )
}
