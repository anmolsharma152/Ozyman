/**
 * Format unknown errors for logs/UI without empty `{}` serialization.
 * InsForge / PostgREST errors often only stringify useful fields via .message/.details.
 */

export function formatUnknownError(err: unknown): string {
  if (err == null) return 'unknown error'
  if (typeof err === 'string') return err
  if (err instanceof Error) {
    const parts = [err.message]
    const cause = (err as Error & { cause?: unknown }).cause
    if (cause) parts.push(`cause=${formatUnknownError(cause)}`)
    return parts.filter(Boolean).join(' | ')
  }
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>
    const bits = [
      o.message,
      o.details,
      o.hint,
      o.code,
      o.status,
      o.statusText,
    ]
      .filter((v) => v != null && String(v).trim() !== '')
      .map(String)
    if (bits.length) return bits.join(' | ')
    try {
      const json = JSON.stringify(err)
      if (json && json !== '{}') return json
    } catch {
      /* ignore */
    }
  }
  return String(err)
}

/** Soft-timeout a promise; on timeout returns fallback (does not cancel the underlying work). */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(onTimeout()), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
