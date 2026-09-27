import { describe, it, expect, beforeEach, vi } from "vitest";

const dmSetState = vi.hoisted(() => vi.fn());

// Mock the stores so reset() doesn't pull in their full initialization.
vi.mock('@/store/chat', () => ({
  useChatStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock('@/store/read-state', () => ({
  useReadStateStore: { getState: () => ({ reset: vi.fn() }) },
}));
vi.mock("@/store/voice", () => ({
  useVoiceStore: { getState: () => ({ leaveVoice: vi.fn() }) },
}));
vi.mock("@/store/dm", () => ({
  useDMStore: { setState: (...args: unknown[]) => dmSetState(...args) },
}));

import { resetAllClientState, registerClientResetHook } from './reset';

beforeEach(() => {
  localStorage.clear();
  dmSetState.mockClear();
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
  it("clears decrypted DM messages and thread previews", () => {
    resetAllClientState();

    expect(dmSetState).toHaveBeenCalledWith(expect.objectContaining({
      isDMMode: false,
      activeDMPubkey: null,
      threads: [],
      messages: [],
      isLoadingMessages: false,
      isLoadingThreads: false,
      hasMoreHistory: false,
      showProtocolPrompt: null,
    }));
  });

});

describe('registered teardown hooks', () => {
  it('runs every registered hook, and stops running one that unregisters', () => {
    const hook = vi.fn();
    const unregister = registerClientResetHook(hook);

    resetAllClientState();
    expect(hook).toHaveBeenCalledTimes(1);

    unregister();
    resetAllClientState();
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('one hook throwing does not strand the others', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const after = vi.fn();
    const unregisterBad = registerClientResetHook(() => { throw new Error('boom'); });
    const unregisterGood = registerClientResetHook(after);

    // A subsystem that fails to tear down must not leave the next account
    // inheriting whatever came after it in the list.
    expect(() => resetAllClientState()).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);

    unregisterBad();
    unregisterGood();
    warn.mockRestore();
  });

  it('is what wires the apps subsystem in, without reset.ts importing it', async () => {
    // The import is the registration: `client.ts` imports reset.ts, so pulling
    // the apps store in here would make a cycle out of
    // client -> reset -> apps/resolve -> client.
    const { useAppsStore } = await import('@/store/apps');
    await import('@/lib/apps/ingest');

    const create = {
      id: '1'.repeat(64), pubkey: 'a'.repeat(64), created_at: 1000, kind: 2390, sig: '',
      tags: [['h', 'channel-1'], ['t', 'obelisk-app'], ['op', 'create']], content: '{}',
    };
    useAppsStore.getState().ingestMany([create]);
    expect(useAppsStore.getState().logs['1'.repeat(64)]).toHaveLength(1);

    resetAllClientState();
    expect(useAppsStore.getState().logs['1'.repeat(64)]).toBeUndefined();
  });
});
