import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the stores so reset() doesn't pull in their full initialization.
vi.mock('@/store/chat', () => ({
  useChatStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock('@/store/read-state', () => ({
  useReadStateStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock('@/store/voice', () => ({
  useVoiceStore: { getState: () => ({ leaveVoice: vi.fn() }) },
}));

import { resetAllClientState } from './reset';

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
