import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMessageZaps } from '@/hooks/chat/zaps/useMessageZaps';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import type { Event } from 'nostr-tools';

const recipient = 'c'.repeat(64);
const sender = 'a'.repeat(64);
function event(id: string, kind = 7): Event {
  return { id, kind, pubkey: sender, content: '⚡', created_at: 1, sig: '',
    tags: [['e', 'm'], ['p', recipient], ['amount', '21000', 'msat'], ['bolt11', 'lnbc100u...']] };
}

describe('useMessageZaps', () => {
  it('uses the bridge active-relay subscription and counts a payment only once', () => {
    let receive: (event: Event) => void = () => {};
    const release = vi.fn();
    const subscribe = vi.fn((_filter, callback) => { receive = callback; return release; });
    const bridge = fakeBridge({ currentRelayUrl: 'wss://active.example' }, { subscribeFilterWatched: subscribe });
    const hook = renderHook(() => useMessageZaps(['m']), { wrapper: bridgeWrapper(bridge) });
    expect(subscribe).toHaveBeenCalledWith({ kinds: [7, 9735], '#e': ['m'] }, expect.any(Function));
    act(() => {
      receive(event('marker'));
      receive(event('marker'));
      const receipt = event('receipt', 9735);
      receipt.tags.push(['description', JSON.stringify({ kind: 9734, pubkey: sender, content: '',
        tags: [['p', recipient], ['e', 'm'], ['amount', '21000']] })]);
      receive(receipt);
    });
    expect(hook.result.current.get('m')).toMatchObject({ totalSats: 21, count: 1 });
    act(() => receive({ ...event('plain'), tags: [['e', 'm'], ['p', recipient]] }));
    expect(hook.result.current.get('m')?.totalSats).toBe(21);
    hook.unmount();
    expect(release).toHaveBeenCalled();
  });
});
