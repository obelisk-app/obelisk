import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/store/chat';

const who = vi.hoisted(() => ({ me: 'op' as string | null, operator: 'op' as string | null }));
const authorsSeen = vi.hoisted(() => [] as string[][]);
vi.mock('@/services/nostr-bridge', () => ({
  useMyPubkey: () => who.me,
  useMediaPacks: () => ({}),
}));
vi.mock('@/hooks/relay/useRelayOperatorPubkey', () => ({ useRelayOperatorPubkey: () => who.operator }));
vi.mock('@/hooks/relay/useChannelLayout', () => ({
  useChannelLayout: (_r: string | null, authors: string[]) => { authorsSeen.push([...authors]); return { categories: [], updatedAt: 0 }; },
}));
vi.mock('@/hooks/relay/useRelayBranding', () => ({
  useRelayBranding: () => ({ icon: '', banner: '', name: '', description: '', updatedAt: 0 }),
}));
const ROLES = { roles: [{ id: 'mod', name: 'Mod', tier: 1 }], holders: { mod: ['alice'] }, updatedAt: 1 };
const EMOJIS = { title: '', emojis: [{ name: 'wave', url: 'https://e/wave.png' }], updatedAt: 1 };
vi.mock('@/hooks/relay/useRelayRoles', () => ({ useRelayRoles: () => ROLES }));
vi.mock('@/hooks/relay/useRelayEmojiSet', () => ({ useRelayEmojiSet: () => EMOJIS }));

import { useRelayOperatorData } from '@/hooks/relay/useRelayOperatorData';

describe('useRelayOperatorData (shared by both shells)', () => {
  beforeEach(() => {
    authorsSeen.length = 0;
    useChatStore.setState({ rolesByPubkey: {}, serverEmojis: {} });
  });

  it('reads operator data from the relay operator alone', () => {
    who.operator = 'op';
    renderHook(() => useRelayOperatorData('wss://r'));
    expect(authorsSeen.at(-1)).toEqual(['op']);
  });

  it('fans roles and the relay emoji set into the chat store', () => {
    renderHook(() => useRelayOperatorData('wss://r'));
    expect(useChatStore.getState().rolesByPubkey.alice?.[0]?.id).toBe('mod');
    expect(useChatStore.getState().serverEmojis).toEqual({ wave: 'https://e/wave.png' });
  });

  it('only the operator is the operator: a signed-out or different key is not', () => {
    who.me = 'op'; who.operator = 'op';
    expect(renderHook(() => useRelayOperatorData('wss://r')).result.current.isRelayOperator).toBe(true);
    who.me = 'someone';
    expect(renderHook(() => useRelayOperatorData('wss://r')).result.current.isRelayOperator).toBe(false);
    who.me = null; who.operator = null;
    expect(renderHook(() => useRelayOperatorData('wss://r')).result.current.isRelayOperator).toBe(false);
    who.me = 'op'; who.operator = 'op';
  });
});
