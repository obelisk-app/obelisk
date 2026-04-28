import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { buildSnapshot, isLockable, snapshotPath, saveSnapshot, loadSnapshot, deleteSnapshot } from './lockdown';

const SERVER_ID = 'test_lockdown_srv';

describe('isLockable', () => {
  it('accepts text, forum, voice', () => {
    expect(isLockable({ type: 'text' })).toBe(true);
    expect(isLockable({ type: 'forum' })).toBe(true);
    expect(isLockable({ type: 'voice' })).toBe(true);
  });
  it('rejects unknown types', () => {
    expect(isLockable({ type: 'category' })).toBe(false);
    expect(isLockable({ type: 'other' })).toBe(false);
  });
});

describe('buildSnapshot', () => {
  it('captures current writePermission and writeRoleIds per lockable channel', () => {
    const snap = buildSnapshot(
      'srv1',
      'mod',
      [
        { id: 'a', name: 'general', type: 'text', writePermission: null, writeRoleIds: [] },
        { id: 'b', name: 'announcements', type: 'text', writePermission: 'admin', writeRoleIds: ['r1'] },
        { id: 'c', name: 'lounge', type: 'voice' },
        { id: 'd', name: 'Info', type: 'category' as any },
      ],
      new Date('2026-04-18T00:00:00Z'),
    );
    expect(snap.level).toBe('mod');
    expect(snap.serverId).toBe('srv1');
    expect(snap.activatedAt).toBe('2026-04-18T00:00:00.000Z');
    expect(snap.channels.map((c) => c.channelId)).toEqual(['a', 'b', 'c']);
    expect(snap.channels[1]).toEqual({
      channelId: 'b', name: 'announcements', type: 'text',
      writePermission: 'admin', writeRoleIds: ['r1'],
    });
    expect(snap.channels[0].writePermission).toBeNull();
    expect(snap.channels[0].writeRoleIds).toEqual([]);
  });
});

describe('snapshot persistence', () => {
  beforeEach(() => { deleteSnapshot(SERVER_ID); });
  afterEach(() => { deleteSnapshot(SERVER_ID); });

  it('rejects suspicious serverId', () => {
    expect(() => snapshotPath('../etc/passwd')).toThrow();
  });

  it('round-trips via save/load', () => {
    const snap = buildSnapshot(SERVER_ID, 'admin', [
      { id: 'x', name: 'general', type: 'text', writePermission: null, writeRoleIds: [] },
    ]);
    saveSnapshot(snap);
    const loaded = loadSnapshot(SERVER_ID);
    expect(loaded).toEqual(snap);
    const mode = fs.statSync(snapshotPath(SERVER_ID)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('returns null when no snapshot exists', () => {
    expect(loadSnapshot(SERVER_ID)).toBeNull();
  });

  it('deleteSnapshot removes the file', () => {
    saveSnapshot(buildSnapshot(SERVER_ID, 'mod', []));
    expect(loadSnapshot(SERVER_ID)).not.toBeNull();
    deleteSnapshot(SERVER_ID);
    expect(loadSnapshot(SERVER_ID)).toBeNull();
  });
});
