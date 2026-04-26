import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the stores so reset() doesn't pull in their full initialization.
vi.mock('@/store/chat', () => ({ useChatStore: { getState: () => ({ reset: vi.fn() }) } }));
vi.mock('@/store/notification', () => ({ useNotificationStore: { getState: () => ({ reset: vi.fn() }) } }));
vi.mock('@/store/voice', () => ({ useVoiceStore: { getState: () => ({ leaveVoice: vi.fn() }) } }));

import { resetAllClientState } from './reset';
import { setFollowSet, getFollowSet } from './dm/dm-cache';
import { hydrateFollows, ingestKind3, getFollowSet as getInMemFollows } from './dm/follows';

const me = 'a'.repeat(64);
const partner = 'b'.repeat(64);

beforeEach(() => {
  localStorage.clear();
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
    } as any);
    expect(getInMemFollows(me)).not.toBeNull();
    resetAllClientState();
    // After reset, the in-memory follow set is gone. The localStorage seed
    // still has the kind-3, but until hydrateFollows is called again,
    // getFollowSet returns null.
    expect(getInMemFollows(me)).toBeNull();
  });
});
