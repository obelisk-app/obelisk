import { NextRequest } from 'next/server';

/**
 * Defensively parse a Next.js request body as JSON. Returns `{}` on any
 * parse error so route handlers can pattern-match against optional fields
 * without wrapping every property access in its own try/catch.
 *
 * This replaces ~20 copies of `await req.json().catch(() => ({}))` across
 * the API routes — same behavior, one place to adjust if we ever want to
 * surface malformed-body errors explicitly.
 */
// Default generic stays `any` to preserve the loose-typing behavior of the
// raw `await req.json()` calls this replaced — strictening all call sites
// at once is out of scope. Call sites that want typed bodies can pass a
// concrete `<T>`, otherwise they keep the pre-refactor ergonomics.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function parseJsonBody<T = any>(req: NextRequest | Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Pull an error message out of a failed fetch response. Prefers the body's
 * `error` field (what our API routes return) and falls back to a generic
 * "`<action>` failed (HTTP <status>)" label.
 */
export async function extractApiError(res: Response, action: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error || `${action} failed (HTTP ${res.status})`;
}
