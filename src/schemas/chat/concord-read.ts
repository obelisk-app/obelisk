import { CONCORD_READ_BYTES, CONCORD_READ_LIMIT } from '@/constants/chat/concord-read';

/** Reject oversized, malformed and implausibly future-dated account documents. */
export function parseConcordRead(value: string): Record<string, number> {
  if (value.length > CONCORD_READ_BYTES) throw new Error('Read state too large');
  const data: unknown = JSON.parse(value);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid read state');
  const entries = Object.entries(data);
  if (entries.length > CONCORD_READ_LIMIT) throw new Error('Too many read cursors');
  const result: Record<string, number> = {};
  for (const [key, cursor] of entries) {
    if (!/^concord:[a-zA-Z0-9_-]{1,128}:[a-zA-Z0-9_-]{1,128}(?::thread:[a-f0-9]{64})?$/.test(key)
      || !Number.isSafeInteger(cursor) || cursor < 0 || cursor > Date.now() + 300_000) throw new Error('Invalid read cursor');
    result[key] = cursor;
  }
  return result;
}
