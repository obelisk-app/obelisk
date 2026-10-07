import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsGroup, JsSearchHit } from '@/services/nostr-bridge';

const people = vi.hoisted(() => ({ result: { directHit: null, nip05Hit: null, nostrResults: [], loading: false } as Record<string, unknown> }));
vi.mock('@/hooks/identity/useNostrUserSearch', () => ({ useNostrUserSearch: () => people.result }));
const recorded = vi.hoisted(() => [] as string[][]);
vi.mock('@/services/identity/nip05-verify', () => ({
  recordNip05Resolution: (pk: string, nip05: string) => recorded.push([pk, nip05]),
}));
const nip05 = vi.hoisted(() => ({ state: 'unknown' }));
vi.mock('@/hooks/identity/useNip05Status', () => ({ useNip05Status: () => nip05.state }));

import { useResultsPane } from '@/hooks/shell/search/useResultsPane';
import { useUsersSection } from '@/hooks/shell/search/useUsersSection';
import { useUserResultRow } from '@/hooks/shell/search/useUserResultRow';
import { useChannelsSection } from '@/hooks/shell/search/useChannelsSection';
import { useSearchResultRow } from '@/hooks/shell/search/useSearchResultRow';
import { useChatStore } from '@/store/chat';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const PK = 'a'.repeat(64);
const groups = [{ id: 'g1', name: 'General' }] as unknown as JsGroup[];
const msg = (groupId: string | null) => ({ id: 'm', pubkey: PK, content: 'x', createdAt: 1_700_000_000, groupId }) as JsSearchHit;

beforeEach(() => {
  people.result = { directHit: null, nip05Hit: null, nostrResults: [], loading: false };
  recorded.length = 0;
  nip05.state = 'unknown';
  useChatStore.getState().reset();
});

describe('useResultsPane', () => {
  it('names each hit’s channel from one lookup', () => {
    const { result } = renderHook(() => useResultsPane('hi', false, groups));
    expect(result.current.showEntities).toBe(true);
    expect(result.current.groupNameFor(msg('g1'))).toBe('General');
    expect(result.current.groupNameFor(msg('other'))).toBeNull();
    expect(result.current.groupNameFor(msg(null))).toBeNull();
  });
});

describe('useUsersSection', () => {
  it('records a resolved NIP-05 hit and builds the rows', () => {
    people.result = { directHit: null, nip05Hit: { pubkey: PK, displayName: 'A', picture: null, nip05: 'a@x.com' }, nostrResults: [], loading: false };
    const { result } = renderHook(() => useUsersSection('a@x.com'));
    expect(recorded).toEqual([[PK, 'a@x.com']]);
    expect(result.current.rows.map((r) => r.badge)).toEqual(['NIP-05']);
    expect(result.current.empty).toBe(false);
  });

  it('is empty only once the search has settled', () => {
    people.result = { ...people.result, loading: true };
    expect(renderHook(() => useUsersSection('zz')).result.current.empty).toBe(false);
    people.result = { ...people.result, loading: false };
    expect(renderHook(() => useUsersSection('zz')).result.current.empty).toBe(true);
  });
});

describe('useUserResultRow', () => {
  it('falls back to an npub for the name and the handle, and reports no check without one', () => {
    const { result } = renderHook(() => useUserResultRow({ pubkey: PK, displayName: null, picture: null, nip05: null } as never));
    expect(result.current.name).toMatch(/^npub1/);
    expect(result.current.sub).toMatch(/^npub1/);
    expect(result.current.initial).toBe('N');
    expect(result.current.nip05State).toBeUndefined();
  });

  it('shows a confirmed handle as verified', () => {
    nip05.state = 'verified';
    const { result } = renderHook(() => useUserResultRow({ pubkey: PK, displayName: 'Ann', picture: null, nip05: 'ann@x.com' }));
    expect(result.current).toMatchObject({ name: 'Ann', sub: 'ann@x.com', verified: true, nip05State: 'verified' });
  });
});

describe('useChannelsSection', () => {
  it('shows ten at most and opens a channel through the shell', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `g${i}` })) as unknown as JsGroup[];
    const onClose = vi.fn();
    const { result } = renderHook(() => useChannelsSection(many, onClose));
    expect(result.current.shown).toHaveLength(10);
    act(() => result.current.pick(many[3]));
    expect(useChatStore.getState().pendingJump).toMatchObject({ groupId: 'g3' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('useSearchResultRow', () => {
  it('names the author and the channel, an npub when the channel has no name', () => {
    const wrapper = bridgeWrapper(fakeBridge());
    const named = renderHook(() => useSearchResultRow(msg('g1'), 'General'), { wrapper }).result.current;
    expect(named.channel).toBe('General');
    expect(named.name).not.toBe('');
    expect(named.time).not.toBe('');
    expect(renderHook(() => useSearchResultRow(msg(null), null), { wrapper }).result.current.channel).toBe('?');
    expect(renderHook(() => useSearchResultRow(msg(PK), null), { wrapper }).result.current.channel).toMatch(/^npub1/);
  });
});
