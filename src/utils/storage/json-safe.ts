/**
 * Safe JSON parsing helpers used by the small localStorage-backed stores.
 *
 * `safeJsonParse` swallows parse errors and returns the supplied fallback,
 * so callers don't need to repeat the same try/catch boilerplate. Use it
 * for trusted-origin data (localStorage, app-controlled blobs); for
 * untrusted input pair it with a schema validator.
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
