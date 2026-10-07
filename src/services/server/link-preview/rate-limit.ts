/**
 * Per-IP budget. This endpoint makes outbound requests, so it must not
 * become an open proxy.
 */

import { RATE_LIMIT, RATE_WINDOW_MS } from '@/constants/server/link-preview';

const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (hits.size > 5_000) {
      for (const [key, value] of hits) if (now > value.resetAt) hits.delete(key);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}
