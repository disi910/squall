import type { WorldState } from '../../schema/index.ts'

const COLLECTIONS: { key: keyof Omit<WorldState, 'now'>; label: string }[] = [
  { key: 'tickets', label: 'Tickets' },
  { key: 'refunds', label: 'Refunds' },
  { key: 'orders', label: 'Orders' },
  { key: 'shipments', label: 'Carrier' },
  { key: 'customers', label: 'Customers' },
]

interface WorldPanelProps {
  world: WorldState
  /** Paths changed at the current step (highlighted) and earlier (dotted). */
  changed: { now: Set<string>; earlier: Set<string> }
  /** Paths written by a call a safety grader flagged, mapped to the step where they landed. */
  harmful: Map<string, number>
  step: number
}

function formatValue(key: string, value: unknown) {
  if (key === 'items' && Array.isArray(value))
    return value.map((it: { qty: number; name: string; unitPrice: number }, i) => (
      <span key={i} className="block">
        {it.qty}× {it.name} · {it.unitPrice} NOK
      </span>
    ))
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
}

/** The right panel: the world after the current step, with this step's changes highlighted. */
export function WorldPanel({ world, changed, harmful, step }: WorldPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {COLLECTIONS.map(({ key, label }) => {
        const entities = Object.entries(world[key] ?? {})
        if (!entities.length && key !== 'refunds') return null
        return (
          <section key={key} className="flex flex-col gap-1.5" aria-label={label}>
            <span className="eyebrow">{label}</span>
            {!entities.length && <p className="text-[13px] text-faint italic">No refunds yet.</p>}
            {entities.map(([id, entity]) => {
              const path = `/${key}/${id}`
              const harmfulAt = harmful.get(path)
              const isHarmful = harmfulAt !== undefined && harmfulAt <= step
              const isNew = changed.now.has(path)
              return (
                <div
                  key={id}
                  className={`flex flex-col gap-1.5 rounded-md border bg-raised px-2.5 py-2 ${
                    isHarmful
                      ? 'border-unsafe shadow-[inset_3px_0_0_var(--unsafe)]'
                      : isNew
                        ? 'border-ok shadow-[inset_3px_0_0_var(--ok)]'
                        : 'border-line'
                  }`}
                >
                  <div className="flex justify-between gap-2 font-mono text-[12.5px]">
                    <span>{id}</span>
                    {isHarmful ? (
                      <span className="text-unsafe">unauthorized</span>
                    ) : isNew ? (
                      <span className="text-ok">added</span>
                    ) : null}
                  </div>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1 text-[13px]">
                    {Object.entries(entity as Record<string, unknown>).map(([field, value]) => {
                      const fieldPath = `${path}/${field}`
                      const now = changed.now.has(fieldPath)
                      const earlier = changed.earlier.has(fieldPath)
                      return (
                        <div key={field} className="contents">
                          <dt className="font-mono text-xs text-faint">{field}</dt>
                          <dd className="m-0 min-w-0 tabular-nums [overflow-wrap:anywhere]">
                            <span className={now ? '-mx-1 rounded-sm bg-ok-soft px-1' : ''}>
                              {formatValue(field, value)}
                            </span>
                            {earlier && !now && (
                              <span className="text-faint" title="Changed at an earlier step">
                                {' '}
                                •
                              </span>
                            )}
                            {now && <span className="sr-only"> (changed at this step)</span>}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
