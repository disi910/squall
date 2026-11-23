/**
 * RFC 6901 JSON Pointer helpers and JSON equality, with no zod dependency.
 * Used by run validation (replaying world diffs) and by the replay viewer.
 */
function pointerTokens(path: string): string[] {
  // RFC 6901: "~1" encodes "/" and "~0" encodes "~"; decode ~1 first.
  return path
    .split('/')
    .slice(1)
    .map((t) => t.replaceAll('~1', '/').replaceAll('~0', '~'))
}

type JsonObject = Record<string, unknown>
const isObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Returns the value at `path`, or null when any segment is missing. */
export function getAtPointer(root: unknown, path: string): unknown {
  let node: unknown = root
  for (const key of pointerTokens(path)) {
    if (!isObject(node) || !(key in node)) return null
    node = node[key]
  }
  return node === undefined ? null : node
}

/** Sets (or, for `value === null`, deletes) the value at `path`, creating parents as needed. Mutates `root`. */
export function setAtPointer(root: JsonObject, path: string, value: unknown): void {
  const keys = pointerTokens(path)
  let node: JsonObject = root
  for (const key of keys.slice(0, -1)) {
    const next = node[key]
    if (!isObject(next)) node[key] = {}
    node = node[key] as JsonObject
  }
  const last = keys[keys.length - 1]
  if (last === undefined) return
  if (value === null) delete node[last]
  else node[last] = structuredClone(value)
}

/** Structural equality for JSON values; key order does not matter. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]))
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a)
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && jsonEqual(a[k], b[k]))
  }
  return false
}
