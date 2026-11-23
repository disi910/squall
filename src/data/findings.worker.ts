/**
 * Parses runs.json and computes the landing-page findings off the main thread.
 * Parsing 7,200 summaries is the single most expensive thing the landing page
 * does; in a worker it no longer blocks rendering or input.
 */
import type { DatasetManifest, RunSummary } from '../schema/index.ts'
import { computeFindings } from './findings.ts'

// The project's TS config uses the DOM lib, where `self` is a Window; this is the worker-scope shape we use.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ dataRoot: string }>) => void) | null
  postMessage(message: unknown): void
}

async function getJson<T>(dataRoot: string, path: string): Promise<T> {
  const res = await fetch(dataRoot + path)
  if (!res.ok)
    throw Object.assign(new Error(`Could not load ${path} (HTTP ${res.status}).`), { path })
  return (await res.json()) as T
}

scope.onmessage = async ({ data: { dataRoot } }) => {
  try {
    // Trusts the build-time validation, like loadSummaries does in production.
    const manifest = await getJson<DatasetManifest>(dataRoot, 'manifest.json')
    const runs = await getJson<RunSummary[]>(dataRoot, manifest.files.summaries)
    scope.postMessage({ ok: true, findings: computeFindings({ manifest, runs }) })
  } catch (err) {
    const e = err as Error & { path?: string }
    scope.postMessage({ ok: false, message: e.message, path: e.path ?? '' })
  }
}
