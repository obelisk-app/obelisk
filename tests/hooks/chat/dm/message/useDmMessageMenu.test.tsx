import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { BRIDGE_MOCK_PUBKEY } from '@tests/support/mocks/nostr-bridge';
import { useDmMessageMenu } from '@/hooks/chat/dm/message/useDmMessageMenu';
import type { JsDirectMessage } from '@/services/nostr-bridge';

const PEER = 'b'.repeat(64);
const msg = (over: Partial<JsDirectMessage> = {}): JsDirectMessage => ({
  id: 'r'.repeat(64), counterparty: PEER, outgoing: false, content: 'hello', createdAt: 100, protocol: 'nip17', ...over,
});

describe('useDmMessageMenu', () => {
  let written: string[] = [];
  beforeEach(() => {
    written = [];
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (v: string) => { written.push(v); } } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('the sender is the other person on an incoming message and me on an outgoing one', () => {
    const wrapper = bridgeWrapper(fakeBridge());
    expect(renderHook(() => useDmMessageMenu(msg()), { wrapper }).result.current.sender).toBe(PEER);
    expect(renderHook(() => useDmMessageMenu(msg({ outgoing: true })), { wrapper }).result.current.sender).toBe(BRIDGE_MOCK_PUBKEY);
  });

  it('a copy action writes its value and closes the menu', () => {
    const { result } = renderHook(() => useDmMessageMenu(msg()), { wrapper: bridgeWrapper(fakeBridge()) });
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.copyText());
    expect(written).toEqual(['hello']);
    expect(result.current.open).toBe(false);
  });

  it('openRaw closes the menu and opens the dialog; closeRaw closes it', () => {
    const { result } = renderHook(() => useDmMessageMenu(msg()), { wrapper: bridgeWrapper(fakeBridge()) });
    act(() => result.current.toggle());
    act(() => result.current.openRaw());
    expect(result.current.open).toBe(false);
    expect(result.current.rawOpen).toBe(true);
    act(() => result.current.closeRaw());
    expect(result.current.rawOpen).toBe(false);
  });
});
