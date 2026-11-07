import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordMemberActivity } from '@/services/chat/members/presence';
import { useChatStore } from '@/store/chat';
import { presenceActivityKey } from '@/utils/chat/members/presence';

const RELAY = 'wss://presence.test';
const KEY = 'a'.repeat(64);

beforeEach(() => useChatStore.getState().reset());
afterEach(() => vi.restoreAllMocks());

describe('recordMemberActivity', () => {
  it('normalizes relay scope, retains the newest timestamp and bounds future timestamps to now', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    recordMemberActivity(RELAY + '/', KEY, now / 1000 - 60);
    recordMemberActivity(RELAY, KEY, now / 1000 - 120);
    expect(useChatStore.getState().lastActivityAt[presenceActivityKey(RELAY, KEY)]).toBe(now - 60_000);
    recordMemberActivity(RELAY, KEY, now / 1000 + 60);
    expect(useChatStore.getState().lastActivityAt[presenceActivityKey(RELAY, KEY)]).toBe(now);
    expect(useChatStore.getState().lastActivityAt[presenceActivityKey('wss://elsewhere.test', KEY)]).toBeUndefined();
  });

  it('ignores missing and invalid activity data', () => {
    for (const createdAt of [0, -1, NaN, Infinity]) recordMemberActivity(RELAY, KEY, createdAt);
    recordMemberActivity('', KEY, 123);
    recordMemberActivity(RELAY, '', 123);
    expect(useChatStore.getState().lastActivityAt).toEqual({});
  });
});
