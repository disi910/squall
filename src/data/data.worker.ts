/**
 * The data worker. It parses runs.json once, keeps the result, and answers
 * requests (aggregates, the run index, single summaries) off the main thread.
 * Parsing 7,200 summaries is the most expensive thing the site does; here it
 * never blocks rendering or input, and it happens once per visit.
 */
import type { DatasetManifest, RunSummary } from '../schema/index.ts'
import type { Dataset } from './load.ts'
import { handleRequest } from './requests.ts'
import type { DataRequest } from './requests.ts'

// The project's TS config uses the DOM lib, where `self` is a Window; this is the worker-scope shape we use.
const scope = self as unknown as {
  onmessage:
    ((e: MessageEvent<{ id: number; dataRoot: string; request: DataRequest }>) => void) | null
  postMessage(message: unknown): void
}

async function getJson<T>(dataRoot: string, path: string): Promise<T> {
  const res = await fetch(dataRoot + path)
  if (!res.ok)
    throw Object.assign(new Error(`Could not load ${path} (HTTP ${res.status}).`), { path })
  return (await res.json()) as T
}

let dataset: Promise<Dataset> | null = null

function loadOnce(dataRoot: string): Promise<Dataset> {
  if (!dataset) {
    dataset = (async () => {
      // Trusts the build-time validation, like loadSummaries does in production.
      const manifest = await getJson<DatasetManifest>(dataRoot, 'manifest.json')
      const runs = await getJson<RunSummary[]>(dataRoot, manifest.files.summaries)
      return { manifest, runs }
    })()
    dataset.catch(() => (dataset = null)) // allow a retry after a failed load
  }
  return dataset
}

scope.onmessage = async ({ data: { id, dataRoot, request } }) => {
  try {
    scope.postMessage({ id, ok: true, value: handleRequest(await loadOnce(dataRoot), request) })
  } catch (err) {
    const e = err as Error & { path?: string }
    scope.postMessage({ id, ok: false, message: e.message, path: e.path ?? '' })
  }
}
