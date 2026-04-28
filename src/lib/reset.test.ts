import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the stores so reset() doesn't pull in their full initialization.
vi.mock('@/store/chat', () => ({
  useChatStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock('@/store/notification', () => ({
  useNotificationStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock('@/store/voice', () => ({
  useVoiceStore: { getState: () => ({ leaveVoice: vi.fn() }) },
}));

import { resetAllClientState } from './reset';
import { setFollowSet, getFollowSet } from './dm/dm-cache';
import { hydrateFollows, ingestKind3, getFollowSet as getInMemFollows } from './dm/follows';

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
});

describe('resetAllClientState — localStorage wipe', () => {
  it('removes all chat:lastSeen:* keys (legacy unscoped + pubkey-scoped)', () => {
    localStorage.setItem('chat:lastSeen:ch1', 'm1');
    localStorage.setItem('chat:lastSeen:pk-a:ch2', 'm2');
    localStorage.setItem('chat:lastSeen:pk-b:ch3', 'm3');
    localStorage.setItem('obelisk:something-else', 'preserved');

    resetAllClientState();

    expect(localStorage.getItem('chat:lastSeen:ch1')).toBeNull();
    expect(localStorage.getItem('chat:lastSeen:pk-a:ch2')).toBeNull();
    expect(localStorage.getItem('chat:lastSeen:pk-b:ch3')).toBeNull();
    expect(localStorage.getItem('obelisk:something-else')).toBe('preserved');
  });

  it('also removes the original auth/follow keys', () => {
    localStorage.setItem('obelisk-auth-in-progress', '1');
    localStorage.setItem('obelisk:followed-migrated', '1');
    localStorage.setItem('obelisk:followed-posts', '[]');

    resetAllClientState();

    expect(localStorage.getItem('obelisk-auth-in-progress')).toBeNull();
    expect(localStorage.getItem('obelisk:followed-migrated')).toBeNull();
    expect(localStorage.getItem('obelisk:followed-posts')).toBeNull();
  });
});

describe('resetAllClientState — DM module RAM hygiene', () => {
  it('clears in-memory follow sets across identities', () => {
    setFollowSet(me, new Set([partner]));
    expect(getFollowSet(me)).toEqual(new Set([partner]));
    resetAllClientState();
    expect(getFollowSet(me)).toBeNull();
  });

  it('clears the follows in-memory map (next ingestKind3 acts as fresh)', () => {
    hydrateFollows(me);
    ingestKind3(me, {
      id: 'e1', kind: 3, pubkey: me, created_at: 1000,
      tags: [['p', partner]], content: '', sig: 'x',
    } as never);
    expect(getInMemFollows(me)).not.toBeNull();
    resetAllClientState();
    // After reset, the in-memory follow set is gone. The localStorage seed
    // still has the kind-3, but until hydrateFollows is called again,
    // getFollowSet returns null.
    expect(getInMemFollows(me)).toBeNull();
  });
});
