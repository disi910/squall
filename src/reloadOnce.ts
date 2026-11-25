/**
 * Recovery from stale script files after a deploy. Chunk file names carry a
 * content hash, and a deploy removes the old ones, so a tab opened before the
 * deploy fails to load any chunk it hasn't loaded yet. Reloading fetches the
 * new index.html, which points at the new chunks.
 */

export const RELOAD_KEY = 'squall:chunk-reload'
/** A failure this soon after a reload is not a stale tab: show the error instead of looping. */
export const RELOAD_WINDOW_MS = 10_000

export interface ReloadDeps {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  reload: () => void
  now: () => number
}

const browserDeps = (): ReloadDeps => ({
  storage: window.sessionStorage,
  reload: () => window.location.reload(),
  now: Date.now,
})

/**
 * Wraps a dynamic import. If it fails and the page hasn't just reloaded, reload
 * once and leave the load pending, so the page's Suspense fallback stays on
 * screen until the reload lands instead of flashing the error page. If it fails
 * again within the window, or storage is unavailable, the error goes through to
 * the route's error boundary as before.
 */
export function reloadOnce<T>(load: () => Promise<T>, deps?: ReloadDeps): () => Promise<T> {
  return () =>
    load().catch((error: unknown) => {
      const { storage, reload, now } = deps ?? browserDeps()
      try {
        const last = Number(storage.getItem(RELOAD_KEY) ?? 0)
        if (now() - last < RELOAD_WINDOW_MS) throw error
        storage.setItem(RELOAD_KEY, String(now()))
      } catch {
        throw error
      }
      reload()
      return new Promise<T>(() => {})
    })
}
