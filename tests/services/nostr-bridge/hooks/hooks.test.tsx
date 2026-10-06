/**
 * The hooks under `hooks/`, each on a fake bridge: the derived values they
 * compute (follows, live-call expiry, relay people) and the re-export
 * surface the bridge's `index.ts` keeps for its importers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Event as NostrEvent } from 'nostr-tools';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

let contactList: NostrEvent | null = null;
let calls: Record<string, unknown> = {};
const admins: Record<string, string[]> = { g1: [A] };
const members: Record<string, string[]> = { g1: [A, B], g2: [B] };
const ensured: string[] = [];

vi.mock('@/services/nostr-bridge/client', () => ({
  getBridge: () => Promise.resolve({
    subscribeMyContactList: (cb: (e: NostrEvent | null) => void) => { cb(contactList); return () => {}; },
    subscribeActiveCallByChannel: (cb: (m: Record<string, unknown>) => void) => { cb(calls); return () => {}; },
    subscribeAdminsByGroup: (cb: (m: Record<string, string[]>) => void) => { cb(admins); return () => {}; },
    subscribeMembersByGroup: (cb: (m: Record<string, string[]>) => void) => { cb(members); return () => {}; },
    subscribeUserMetadataMap: (cb: (m: Record<string, { name?: string; displayName?: string }>) => void) => {
      cb({ [A]: { displayName: 'Zed' }, [B]: { displayName: 'Amy' } });
      return () => {};
    },
    ensureUserMetadata: (pk: string) => { ensured.push(pk); },
  }),
  getBridgeImpl: () => null,
}));

import * as sessionHooks from '@/services/nostr-bridge/hooks/session';
import * as listHooks from '@/services/nostr-bridge/hooks/lists';
import * as groupHooks from '@/services/nostr-bridge/hooks/groups';
import * as messageHooks from '@/services/nostr-bridge/hooks/messages';
import * as memberHooks from '@/services/nostr-bridge/hooks/members';
import * as callHooks from '@/services/nostr-bridge/hooks/calls';
import * as index from '@/services/nostr-bridge';

/** Every hook file, merged: what the deleted `stores.ts` barrel re-exported. */
const stores = { ...sessionHooks, ...listHooks, ...groupHooks, ...messageHooks, ...memberHooks, ...callHooks };

describe('nostr-bridge hooks', () => {
  beforeEach(() => {
    contactList = null;
    calls = {};
    ensured.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('index.ts exports every hook by its old name, the very function its hook file defines', () => {
    for (const name of [
      'useIsLoggedIn', 'useIsRehydrating', 'useNipSigner', 'useSignerReady', 'useGroups', 'useGroupById',
      'useMessages', 'useLoadEarlier', 'useDirectMessages', 'useRelayPeople', 'useGroupMemberInfo',
      'useActiveCall', 'useActiveCallByChannel', 'useMyFollows', 'useMyMutes', 'useRelayAccess',
    ] as const) {
      expect(typeof stores[name]).toBe('function');
      expect(index[name]).toBe(stores[name]);
    }
  });

  it('useMyFollows keeps unique, lowercased, well-formed p-tags', async () => {
    contactList = {
      id: 'c', pubkey: A, kind: 3, created_at: 1, sig: '', content: '',
      tags: [['p', B], ['p', B.toUpperCase()], ['p', 'not-a-key'], ['e', A]],
    };
    const { result } = renderHook(() => stores.useMyFollows());
    await waitFor(() => expect(result.current).toEqual([B]));
  });

  it('useActiveCall hides an expired call and an SFU room reporting nobody in it', async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000 });
    const now = Math.floor(Date.now() / 1000);
    calls = {
      live: { hostPubkey: A, status: 'open', participantCount: 2, expiresAt: now + 60, createdAt: now },
      empty: { hostPubkey: A, status: 'open', participantCount: 0, expiresAt: now + 60, createdAt: now },
    };
    const live = renderHook(() => stores.useActiveCall('live'));
    const empty = renderHook(() => stores.useActiveCall('empty'));
    await act(async () => { await Promise.resolve(); });
    expect(live.result.current?.participantCount).toBe(2);
    expect(empty.result.current).toBeNull();
    await act(async () => { vi.advanceTimersByTime(75_000); });
    expect(live.result.current).toBeNull();
  });

  it('useRelayPeople unions every channel, marks admins, asks for profiles and sorts by name', async () => {
    const { result } = renderHook(() => stores.useRelayPeople());
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((p) => [p.displayName, p.role])).toEqual([['Amy', 'member'], ['Zed', 'admin']]);
    expect(new Set(ensured)).toEqual(new Set([A, B]));
  });
});
