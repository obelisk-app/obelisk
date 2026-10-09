import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsDirectMessage } from '@/services/nostr-bridge';

const ensured = vi.hoisted(() => [] as string[][]);
vi.mock('@/services/social/profiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/social/profiles')>()),
  ensureSocialProfiles: vi.fn(async (pks: string[]) => { ensured.push(pks); }),
}));

import { useDMStore } from '@/store/chat/dm';
import { useDmList } from '@/hooks/shell/dm/useDmList';
import { setDmOptInEnabled } from '@/services/chat/dm/opt-in';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const msg = (createdAt: number) => ({ id: `${createdAt}`, content: 'hi', createdAt, outgoing: false }) as JsDirectMessage;
const contacts = (...pks: string[]) => ({ kind: 3, tags: pks.map((p) => ['p', p]), content: '', created_at: 1, pubkey: 'f'.repeat(64), id: 'c', sig: 's' });

function setup(onPick = vi.fn()) {
  const fake = fakeBridge(
    { dmsByPeer: { [ALICE]: [msg(1)], [BOB]: [msg(2)] }, myContactList: contacts(ALICE) as never },
    { disableDirectMessages: vi.fn() },
  );
  return { ...renderHook(() => useDmList(onPick), { wrapper: bridgeWrapper(fake) }), onPick };
}

describe('useDmList', () => {
  beforeEach(() => { setDmOptInEnabled(true); ensured.length = 0; });
  afterEach(() => setDmOptInEnabled(false));

  it('lists remembered chats before their message bodies are decrypted', () => {
    useDMStore.setState({ conversationIndex: { [ALICE]: 42 } });
    const fake = fakeBridge({ dmsByPeer: {}, myContactList: contacts(ALICE) as never });
    const { result, unmount } = renderHook(() => useDmList(vi.fn()), { wrapper: bridgeWrapper(fake) });
    expect(result.current.hasConversations).toBe(true);
    expect(result.current.visible).toEqual([{ pubkey: ALICE, last: undefined, sortKey: 42 }]);
    unmount();
    useDMStore.setState({ conversationIndex: {} });
  });

  it('splits the conversations and opens on Follows', () => {
    const { result } = setup();
    expect(result.current.activeTab).toBe('follows');
    expect(result.current.tabs).toEqual([
      { id: 'follows', count: 1, active: true },
      { id: 'others', count: 1, active: false },
    ]);
    expect(result.current.visible.map((p) => p.pubkey)).toEqual([ALICE]);
    act(() => result.current.setTab('others'));
    expect(result.current.visible.map((p) => p.pubkey)).toEqual([BOB]);
  });

  it('resolves every peer in one batch', () => {
    setup();
    expect(ensured).toEqual([[BOB, ALICE]]);
  });

  it('opens and closes the search, and a pick from it opens the thread', () => {
    const { result, onPick } = setup();
    act(() => result.current.toggleComposing());
    expect(result.current.composing).toBe(true);
    act(() => result.current.pickFromComposer(BOB));
    expect(result.current.composing).toBe(false);
    expect(onPick).toHaveBeenCalledWith(BOB);
    act(() => result.current.startComposing());
    act(() => result.current.closeComposer());
    expect(result.current.composing).toBe(false);
  });

  it('explains where the DM cache lives', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { result } = setup();
    result.current.explainCache();
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});
