/** A placeholder block with a fixed size, so content arriving later does not shift the layout. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-2 ${className}`} />
}

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-6">
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
