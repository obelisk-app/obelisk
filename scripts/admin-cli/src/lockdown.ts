import path from 'path';
import fs from 'fs';
import { MEMORY_DIR, ensureMemoryDir } from './memory';

export type LockdownLevel = 'admin' | 'mod';

export type ChannelPerm = {
  channelId: string;
  name: string;
  type: string;
  writePermission: string | null;
  writeRoleIds: string[];
};

export type LockdownSnapshot = {
  serverId: string;
  level: LockdownLevel;
  activatedAt: string;
  channels: ChannelPerm[];
};

export function snapshotPath(serverId: string): string {
  if (!/^[\w-]+$/.test(serverId)) throw new Error(`Refusing to write lockdown for suspicious serverId: ${serverId}`);
  return path.join(MEMORY_DIR, `${serverId}.lockdown.json`);
}

export function loadSnapshot(serverId: string): LockdownSnapshot | null {
  try {
    return JSON.parse(fs.readFileSync(snapshotPath(serverId), 'utf8')) as LockdownSnapshot;
  } catch {
    return null;
  }
}

export function saveSnapshot(snap: LockdownSnapshot): void {
  ensureMemoryDir();
  fs.writeFileSync(snapshotPath(snap.serverId), JSON.stringify(snap, null, 2), { mode: 0o600 });
}

export function deleteSnapshot(serverId: string): void {
  try { fs.unlinkSync(snapshotPath(serverId)); } catch { /* already gone */ }
}

// Channels whose write gate makes sense to flip. Voice channels have a text-chat
// sidebar gated by writePermission too, so they're included.
const LOCKABLE_TYPES = new Set(['text', 'forum', 'voice']);

export function isLockable(ch: { type: string }): boolean {
  return LOCKABLE_TYPES.has(ch.type);
}

export function buildSnapshot(
  serverId: string,
  level: LockdownLevel,
  channels: Array<{ id: string; name: string; type: string; writePermission?: string | null; writeRoleIds?: string[] }>,
  now: Date = new Date(),
): LockdownSnapshot {
  return {
    serverId,
    level,
    activatedAt: now.toISOString(),
    channels: channels.filter(isLockable).map((c) => ({
      channelId: c.id,
      name: c.name,
      type: c.type,
      writePermission: c.writePermission ?? null,
      writeRoleIds: c.writeRoleIds ?? [],
    })),
  };
}
