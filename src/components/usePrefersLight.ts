import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-color-scheme: light)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia?.(QUERY)
  mq?.addEventListener('change', onChange)
  return () => mq?.removeEventListener('change', onChange)
}

/** True when the light palette is active. The site follows the system setting, like the CSS tokens. */
export function usePrefersLight(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(QUERY).matches ?? false,
    () => false,
  )
}
