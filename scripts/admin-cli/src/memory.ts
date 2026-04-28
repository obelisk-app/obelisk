import path from 'path';
import fs from 'fs';

export const MEMORY_DIR = path.resolve(__dirname, '..', 'memory');

export type CachedMessage = {
  id: string;
  authorPubkey: string;
  content: string;
  createdAt: string;
  replyToId?: string | null;
};

export type CachedChannel = {
  id: string;
  name: string;
  description?: string | null;
  emoji?: string | null;
  type: string;
  categoryId?: string | null;
  position?: number;
  writePermission?: string | null;
  readPermission?: string | null;
  writeRoleIds?: string[];
  readRoleIds?: string[];
  lastScannedAt?: string;
  lastScannedMessageId?: string | null;
  recentMessages?: CachedMessage[];
};

export type ServerMemory = {
  serverId: string;
  server: Record<string, any>;
  categories: Array<{ id: string; name: string; position: number }>;
  channels: CachedChannel[];
  syncedAt?: string;
  scannedAt?: string;
};

const RECENT_CAP = 200; // per-channel cap — keeps files bounded

export function ensureMemoryDir(): void {
  fs.mkdirSync(MEMORY_DIR, { recursive: true, mode: 0o700 });
}

export function memoryPath(serverId: string): string {
  if (!/^[\w-]+$/.test(serverId)) throw new Error(`Refusing to write memory for suspicious serverId: ${serverId}`);
  return path.join(MEMORY_DIR, `${serverId}.json`);
}

export function loadServerMemory(serverId: string): ServerMemory | null {
  try {
    const raw = fs.readFileSync(memoryPath(serverId), 'utf8');
    return JSON.parse(raw) as ServerMemory;
  } catch {
    return null;
  }
}

export function saveServerMemory(mem: ServerMemory): void {
  ensureMemoryDir();
  fs.writeFileSync(memoryPath(mem.serverId), JSON.stringify(mem, null, 2), { mode: 0o600 });
  try { fs.chmodSync(memoryPath(mem.serverId), 0o600); } catch { /* best effort */ }
}

export function listServerMemories(): string[] {
  try {
    return fs.readdirSync(MEMORY_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

/**
 * Merge a freshly-fetched list of messages into an existing channel cache.
 * Input `fetched` is chronological (oldest → newest), as returned by the API.
 * Keeps only messages strictly newer than `lastScannedMessageId` when that
 * id appears within `fetched`. Deduplicates by id. Caps the stored list at
 * RECENT_CAP (keeping the newest tail).
 *
 * Returns the merged list + the new cursor (newest message id).
 */
export function mergeMessages(
  existing: CachedMessage[] | undefined,
  fetched: CachedMessage[],
  lastScannedMessageId: string | null | undefined
): { messages: CachedMessage[]; newCursor: string | null; newCount: number } {
  const existingMap = new Map((existing ?? []).map((m) => [m.id, m]));
  const cursorIndex = lastScannedMessageId
    ? fetched.findIndex((m) => m.id === lastScannedMessageId)
    : -1;

  // When the previous cursor is inside the fetched page, only messages after
  // it are "new". Otherwise treat everything not already cached as new.
  const candidateNew = cursorIndex >= 0 ? fetched.slice(cursorIndex + 1) : fetched;
  let newCount = 0;
  for (const m of candidateNew) {
    if (!existingMap.has(m.id)) {
      existingMap.set(m.id, m);
      newCount++;
    }
  }

  const merged = Array.from(existingMap.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const trimmed = merged.length > RECENT_CAP ? merged.slice(-RECENT_CAP) : merged;
  const newCursor = trimmed.length > 0 ? trimmed[trimmed.length - 1].id : null;

  return { messages: trimmed, newCursor, newCount };
}

/**
 * Did this channel already cover the newest message in `fetched`? If the
 * newest fetched message id matches `lastScannedMessageId` we know nothing
 * new has arrived and the caller can skip further work.
 */
export function isChannelUpToDate(
  fetchedNewestId: string | null,
  lastScannedMessageId: string | null | undefined
): boolean {
  return !!fetchedNewestId && fetchedNewestId === lastScannedMessageId;
}
