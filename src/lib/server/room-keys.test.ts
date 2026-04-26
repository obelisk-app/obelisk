// src/lib/server/room-keys.test.ts
import { describe, it, expect } from 'vitest';
import { roomFor } from './room-keys';

describe('roomFor', () => {
  it('formats channel rooms', () => {
    expect(roomFor.channel('ch_abc')).toBe('channel:ch_abc');
  });

  it('formats server rooms', () => {
    expect(roomFor.server('srv_xyz')).toBe('server:srv_xyz');
  });

  it('formats DM rooms by pubkey', () => {
    expect(roomFor.dm('npub1foo')).toBe('dm:npub1foo');
  });

  it('formats post rooms', () => {
    expect(roomFor.post('post_123')).toBe('post:post_123');
  });

  it('avoids cross-namespace collision: same id, different scope', () => {
    expect(roomFor.channel('abc')).not.toBe(roomFor.server('abc'));
    expect(roomFor.dm('abc')).not.toBe(roomFor.post('abc'));
  });
});
