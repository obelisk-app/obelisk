import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetAllClientState } from './reset';

// The store resets are tested in their own files; here we only care that
// resetAllClientState wipes the localStorage anchors (chat:lastSeen:*).
vi.mock('@/store/chat', () => ({
  useChatStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock('@/store/notification', () => ({
  useNotificationStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock('@/store/voice', () => ({
  useVoiceStore: { getState: () => ({ leaveVoice: vi.fn() }) },
}));

describe('resetAllClientState — localStorage wipe', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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
