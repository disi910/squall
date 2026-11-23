import type { ReactNode } from 'react'

interface StatCardProps {
  eyebrow: string
  value: ReactNode
  unit?: string
  children: ReactNode
  footnote: ReactNode
}

/** A headline number with what it means and where it comes from (the CI or the sample). */
export function StatCard({ eyebrow, value, unit, children, footnote }: StatCardProps) {
  return (
    <div className="card flex flex-col gap-2.5 p-5">
      <span className="eyebrow">{eyebrow}</span>
      <div className="font-display text-[40px] leading-none font-semibold tabular-nums">
        {value}
        {unit && <small className="ml-1 text-lg font-medium text-muted">{unit}</small>}
      </div>
      <p className="text-sm text-muted">{children}</p>
      <span className="mt-auto font-mono text-xs text-faint tabular-nums">{footnote}</span>
    </div>
  )
}
