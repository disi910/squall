import { describe, expect, it, vi } from 'vitest'
import { RELOAD_KEY, RELOAD_WINDOW_MS, reloadOnce, type ReloadDeps } from './reloadOnce.ts'

/** A fake sessionStorage, a reload spy and a settable clock. */
function fakeDeps(start = 1_000_000) {
  const store = new Map<string, string>()
  const deps = {
    storage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    reload: vi.fn(),
    now: () => deps.time,
    time: start,
  }
  return { deps: deps as ReloadDeps & { time: number; reload: typeof deps.reload }, store }
}

/** Resolves to 'pending' if the promise hasn't settled after a few ticks. */
async function stateOf(p: Promise<unknown>): Promise<'pending' | 'resolved' | 'rejected'> {
  const pending = Symbol()
  const result = await Promise.race([
    p.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<symbol>((r) => setTimeout(() => r(pending), 10)),
  ])
  return result === pending ? 'pending' : (result as 'resolved' | 'rejected')
}

const gone = new TypeError('Failed to fetch dynamically imported module')

describe('reloadOnce', () => {
  it('passes a successful load through and touches nothing', async () => {
    const { deps, store } = fakeDeps()
    await expect(reloadOnce(() => Promise.resolve(42), deps)()).resolves.toBe(42)
    expect(deps.reload).not.toHaveBeenCalled()
    expect(store.size).toBe(0)
  })

  it('reloads on the first failure and keeps the load pending', async () => {
    const { deps, store } = fakeDeps()
    const p = reloadOnce(() => Promise.reject(gone), deps)()
    expect(await stateOf(p)).toBe('pending')
    expect(deps.reload).toHaveBeenCalledTimes(1)
    expect(store.get(RELOAD_KEY)).toBe(String(deps.time))
  })

  it('shows the error if the load fails again right after the reload', async () => {
    const { deps, store } = fakeDeps()
    store.set(RELOAD_KEY, String(deps.time - 2_000))
    await expect(reloadOnce(() => Promise.reject(gone), deps)()).rejects.toBe(gone)
    expect(deps.reload).not.toHaveBeenCalled()
  })

  it('reloads again once the last reload is older than the window', async () => {
    const { deps, store } = fakeDeps()
    store.set(RELOAD_KEY, String(deps.time - RELOAD_WINDOW_MS - 1))
    const p = reloadOnce(() => Promise.reject(gone), deps)()
    expect(await stateOf(p)).toBe('pending')
    expect(deps.reload).toHaveBeenCalledTimes(1)
  })

  it('shows the error rather than risk a loop when storage is unavailable', async () => {
    const { deps } = fakeDeps()
    deps.storage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    }
    await expect(reloadOnce(() => Promise.reject(gone), deps)()).rejects.toBe(gone)
    expect(deps.reload).not.toHaveBeenCalled()
  })
})
