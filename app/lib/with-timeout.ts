// Bound a promise so a slow/hung external call can never block a request forever.

/** Resolve `p`, but if it takes longer than `ms`, resolve to `fallback` instead. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

/** Resolve `p`, but if it takes longer than `ms`, REJECT (so the caller can surface an error). */
export function withDeadline<T>(p: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ])
}
