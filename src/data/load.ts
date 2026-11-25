import type { DatasetManifest, Run, RunSummary } from '../schema/index.ts'
import { reloadOnce } from '../reloadOnce.ts'
import { handleRequest } from './requests.ts'
import type { DataRequest, DataResponses } from './requests.ts'

/**
 * Fetches the generated dataset (public/data/). Each file is fetched once and
 * the promise is cached at module level, which is what React 19's `use()`
 * needs: the same promise on every render, so Suspense resolves once and
 * every component shares the result.
 */

const DATA_ROOT = `${import.meta.env.BASE_URL}data/`

export class DataLoadError extends Error {
  readonly path: string
  constructor(message: string, path: string) {
    super(message)
    this.name = 'DataLoadError'
    this.path = path
  }
}

const cache = new Map<string, Promise<unknown>>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined
  if (!p) {
    p = load()
    // Forget failures so a later render can retry instead of showing a stale error forever.
    p.catch(() => cache.delete(key))
    cache.set(key, p)
  }
  return p
}

/**
 * The zod schemas are imported on demand: validation happens after a fetch
 * anyway, so zod never sits on the critical rendering path. Like the page
 * chunks, a stale tab may find the file gone after a deploy (see reloadOnce).
 */
const schemas = reloadOnce(() => import('../schema/index.ts'))

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(DATA_ROOT + path)
  if (!res.ok) throw new DataLoadError(`Could not load ${path} (HTTP ${res.status}).`, path)
  return res.json()
}

/** Always validated: it is small, and every other file is located through it. */
export const loadManifest = () =>
  cached('manifest', async (): Promise<DatasetManifest> => {
    const [raw, { DatasetManifest }] = await Promise.all([fetchJson('manifest.json'), schemas()])
    return DatasetManifest.parse(raw)
  })

/**
 * Summaries are validated when the data is generated (and in tests). Running
 * 7,200 zod checks again on every page load would slow the site down for no
 * gain, so production trusts the build and development double-checks.
 */
export const loadSummaries = () =>
  cached('summaries', async (): Promise<RunSummary[]> => {
    const manifest = await loadManifest()
    const raw = await fetchJson(manifest.files.summaries)
    if (!import.meta.env.DEV) return raw as RunSummary[]
    const { RunSummary } = await schemas()
    if (!Array.isArray(raw))
      throw new DataLoadError(
        `${manifest.files.summaries} is not an array.`,
        manifest.files.summaries,
      )
    return raw.map((r) => RunSummary.parse(r))
  })

export interface Dataset {
  manifest: DatasetManifest
  runs: RunSummary[]
}

export const loadDataset = () =>
  cached('dataset', async (): Promise<Dataset> => {
    const [manifest, runs] = await Promise.all([loadManifest(), loadSummaries()])
    return { manifest, runs }
  })

/** One full trace, validated with every consistency rule (it is a single run, so this is cheap). */
export const loadTrace = (runId: string) =>
  cached(`trace:${runId}`, async (): Promise<Run> => {
    const [manifest, { Run }] = await Promise.all([loadManifest(), schemas()])
    return Run.parse(
      await fetchJson(manifest.files.traceTemplate.replace('{runId}', encodeURIComponent(runId))),
    )
  })

// ---------- The data worker ----------

type WorkerReply =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; message: string; path: string }

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

/** One worker for the whole visit, so runs.json is parsed once however many pages ask. */
function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
    const p = pending.get(data.id)
    if (!p) return
    pending.delete(data.id)
    if (data.ok) p.resolve(data.value)
    else p.reject(new DataLoadError(data.message, data.path))
  }
  w.onerror = (e) => {
    // A crashed worker fails every pending request and is replaced on the next one.
    for (const p of pending.values()) p.reject(new Error(e.message || 'The data worker failed.'))
    pending.clear()
    worker = null
  }
  worker = w
  return w
}

/** Sends a request to the data worker, or answers it on the main thread where workers are unavailable. */
function ask<K extends DataRequest['kind']>(
  request: Extract<DataRequest, { kind: K }>,
): Promise<DataResponses[K]> {
  if (typeof Worker === 'undefined')
    return loadDataset().then((d) => handleRequest(d, request) as DataResponses[K])
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    getWorker().postMessage({ id, dataRoot: DATA_ROOT, request })
  })
}

/** Every aggregate the overview pages show: landing findings, matrix cells, leaderboard rows. */
export const loadAnalysis = () => cached('analysis', () => ask({ kind: 'analysis' }))

/** One compact row per run, for the run explorer. */
export const loadRunIndex = () => cached('runIndex', () => ask({ kind: 'runIndex' }))

/** One run summary, or null if the id is not in the dataset. */
export const loadRunSummary = (runId: string) =>
  cached(`summary:${runId}`, () => ask({ kind: 'summary', runId }))
