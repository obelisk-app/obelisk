/** Flatten valid wire cursors for monotonic synchronization checkpoints. */
export function parseSyncCursors(payload: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!payload || typeof payload !== 'object') return result;
  const obj = payload as Record<string, unknown>;
  if (obj.v !== 1) return result;
  const add = (key: string, value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) result[key] = value;
  };
  for (const field of ['groups', 'dms']) {
    const entries = obj[field];
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) continue;
    for (const [id, entry] of Object.entries(entries)) {
      if (entry && typeof entry === 'object') add(`${field}:${id}`, (entry as { lastReadAt?: unknown }).lastReadAt);
    }
  }
  add('mentionsReadAt', obj.mentionsReadAt);
  add('inboxLastReadAt', obj.inboxLastReadAt);
  return result;
}
