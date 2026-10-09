vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock({
    useMyPubkey: () => 'a'.repeat(64),
  });
});
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import type { JsDirectMessage } from '@/services/nostr-bridge';

const PEER = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);

const dms = vi.hoisted(() => ({ current: {} as Record<string, JsDirectMessage[]> }));
const retryDirectMessage = vi.hoisted(() => vi.fn());
const cancelPendingDirectMessage = vi.hoisted(() => vi.fn());

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({

    useDirectMessages: () => dms.current,
    nostrActions: {
      retryDirectMessage: (...a: unknown[]) => retryDirectMessage(...a),
      cancelPendingDirectMessage: (...a: unknown[]) => cancelPendingDirectMessage(...a),
    },
  });
});

vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: (pubkey: string | null) => (pubkey ? { displayName: 'Bob', picture: null, nip05: null } : null),
}));

vi.mock('@/services/chat/pq/attestations', () => ({
  hasUsableKeys: vi.fn().mockResolvedValue(false),
  getAttestation: vi.fn(),
  clearAttestationCache: vi.fn(),
}));

import { useDmThread, useDmThreadScroll } from '@/hooks/chat/dm/thread/useDmThread';
import { setPreference } from '@/services/preferences/preferences';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LocaleProvider initialLocale="en">{children}</LocaleProvider>
);

function msg(over: Partial<JsDirectMessage> & { id: string }): JsDirectMessage {
  return { counterparty: PEER, outgoing: false, content: 'hi', createdAt: 1, ...over } as JsDirectMessage;
}

beforeEach(() => {
  dms.current = {};
  retryDirectMessage.mockReset();
  cancelPendingDirectMessage.mockReset();
  setPreference('postQuantumEnabled', true);
});

afterEach(() => {
  setPreference('postQuantumEnabled', false);
  vi.unstubAllGlobals();
});

describe('useDmThread', () => {
  it('orders the thread oldest first and keeps only this counterparty', () => {
    dms.current = {
      [PEER]: [
        msg({ id: 'late', createdAt: 300 }),
        msg({ id: 'stray', createdAt: 200, counterparty: OTHER }),
        msg({ id: 'early', createdAt: 100 }),
      ],
    };
    const { result } = renderHook(() => useDmThread(PEER), { wrapper });
    expect(result.current.messages.map((m) => m.id)).toEqual(['early', 'late']);
    expect(result.current.peerName).toBe('Bob');
  });

  it('is empty, with no name, when there is no peer', () => {
    const { result } = renderHook(() => useDmThread(null), { wrapper });
    expect(result.current.messages).toEqual([]);
    expect(result.current.items).toEqual([]);
    expect(result.current.peerName).toBe('');
  });

  it('puts a divider before the first message of each calendar day', () => {
    const day = 24 * 60 * 60;
    const now = Math.floor(Date.now() / 1000);
    dms.current = {
      [PEER]: [
        msg({ id: 'a', createdAt: now - day * 3 }),
        msg({ id: 'b', createdAt: now - day * 3 + 60 }),
        msg({ id: 'c', createdAt: now }),
      ],
    };
    const { result } = renderHook(() => useDmThread(PEER), { wrapper });
    expect(result.current.items.map((it) => it.type)).toEqual(['divider', 'msg', 'msg', 'divider', 'msg']);
    const last = result.current.items[4];
    expect(last.type === 'msg' && last.index).toBe(2);
  });

  it('marks protocol transitions only, and not at all with the preference off', () => {
    dms.current = {
      [PEER]: [
        msg({ id: '1', protocol: 'nip04' }),
        msg({ id: '2', protocol: 'nip04' }),
        msg({ id: '3', protocol: 'nip17', pq: false }),
      ],
    };
    const { result, rerender } = renderHook(() => useDmThread(PEER), { wrapper });
    expect(result.current.marks).toEqual(['no-giftwrap', null, null]);
    act(() => setPreference('postQuantumEnabled', false));
    rerender();
    expect(result.current.marks).toEqual([]);
  });

  it('reports the wrap for a NIP-17 thread and the exposure for a NIP-04 override', () => {
    const { result } = renderHook(() => useDmThread(PEER), { wrapper });
    expect(result.current.sendProtocol).toBe('nip17');
    expect(result.current.protection).toBe('wrapped');
  });

  it('retry and dismiss address the bridge with this peer', () => {
    const { result } = renderHook(() => useDmThread(PEER), { wrapper });
    result.current.retry('tag-1');
    result.current.dismiss('tag-2');
    expect(retryDirectMessage).toHaveBeenCalledWith(PEER, 'tag-1');
    expect(cancelPendingDirectMessage).toHaveBeenCalledWith(PEER, 'tag-2');
  });
});

describe('useDmThreadScroll', () => {
  /** A real element behind the ref, attached at mount like the skins do. */
  function Probe({ peer, length }: { peer: string; length: number }) {
    const ref = useDmThreadScroll(peer, length);
    return <div ref={ref} data-testid="scroller" />;
  }

  function mountScroller(peer = PEER) {
    const view = render(<Probe peer={peer} length={1} />);
    const el = screen.getByTestId('scroller');
    Object.defineProperty(el, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
    return { el, rerender: (next: { peer: string; length: number }) => view.rerender(<Probe {...next} />) };
  }

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  it('follows new messages while the reader is at the bottom', () => {
    const { el, rerender } = mountScroller();
    rerender({ peer: PEER, length: 2 });
    expect(el.scrollTop).toBe(1000);
  });

  it('leaves the reader alone once they have scrolled up', () => {
    const { el, rerender } = mountScroller();
    el.scrollTop = 100;
    el.dispatchEvent(new Event('scroll'));
    rerender({ peer: PEER, length: 2 });
    expect(el.scrollTop).toBe(100);
  });

  it('starts a new peer at the bottom even if the previous one was scrolled up', () => {
    const { el, rerender } = mountScroller();
    el.scrollTop = 100;
    el.dispatchEvent(new Event('scroll'));
    rerender({ peer: OTHER, length: 1 });
    expect(el.scrollTop).toBe(1000);
  });
});
