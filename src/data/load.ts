import type { DatasetManifest, Run, RunSummary } from '../schema/index.ts'
import { computeAnalysis } from './analysis.ts'
import type { Analysis } from './analysis.ts'

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
 * anyway, so zod never sits on the critical rendering path.
 */
const schemas = () => import('../schema/index.ts')

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

/**
 * Every aggregate the overview pages show (landing findings, matrix,
 * leaderboard), computed in a Web Worker so parsing runs.json never blocks
 * the main thread. Falls back to the main thread where workers are unavailable.
 */
export const loadAnalysis = () =>
  cached('analysis', (): Promise<Analysis> => {
    if (typeof Worker === 'undefined') return loadDataset().then(computeAnalysis)
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), {
        type: 'module',
      })
      worker.onmessage = ({
        data,
      }: MessageEvent<
        { ok: true; analysis: Analysis } | { ok: false; message: string; path: string }
      >) => {
        worker.terminate()
        if (data.ok) resolve(data.analysis)
        else reject(new DataLoadError(data.message, data.path))
      }
      worker.onerror = (e) => {
        worker.terminate()
        reject(new Error(e.message || 'The analysis worker failed.'))
      }
      worker.postMessage({ dataRoot: DATA_ROOT })
    })
  })
