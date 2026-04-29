import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const { enqueueMock, pushToastMock } = vi.hoisted(() => ({
  enqueueMock: vi.fn((_opts: { filters: unknown[]; relays: string[]; onEvent: (e: unknown) => void }) => () => {}),
  pushToastMock: vi.fn(),
}));
vi.mock('@/lib/nostr-coalescer', () => ({
  sharedCoalescer: { enqueue: enqueueMock },
}));
vi.mock('@/lib/nostr', () => ({
  getExplicitRelays: vi.fn(() => ['wss://relay.test', 'wss://r2.test']),
  formatPubkey: (pk: string) => `${pk.slice(0, 8)}...`,
}));
vi.mock('@/store/toast', () => ({
  useToastStore: { getState: () => ({ pushToast: pushToastMock }) },
}));
vi.mock('@/store/chat', () => ({
  useChatStore: { getState: () => ({ memberList: [{ pubkey: 'sender_pub', displayName: 'Alice', isBot: false }] }) },
}));

import { useZapReceipts } from './useZapReceipts';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useZapReceipts', () => {
  it('does nothing when myPubkey is null', () => {
    renderHook(() => useZapReceipts(null));
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('subscribes for kind 9735 events with #p tag matching myPubkey', () => {
    renderHook(() => useZapReceipts('npub_me'));
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    const arg = (enqueueMock.mock.calls[0][0] as unknown) as { filters: any[]; relays: string[] };
    expect(arg.filters[0]).toMatchObject({ kinds: [9735], '#p': ['npub_me'] });
    expect(arg.relays).toEqual(['wss://relay.test', 'wss://r2.test']);
  });

  it('pushes a toast when a valid zap receipt arrives', () => {
    renderHook(() => useZapReceipts('npub_me'));
    const onEvent = ((enqueueMock.mock.calls[0][0] as unknown) as { onEvent: (e: unknown) => void }).onEvent;
    const zapRequest = {
      kind: 9734,
      pubkey: 'sender_pub',
      tags: [['p', 'npub_me'], ['amount', '21000']],
      content: '',
      id: 'zr_id',
      sig: 's',
      created_at: 1,
    };
    const receipt = {
      kind: 9735,
      pubkey: 'provider_pub',
      tags: [
        ['p', 'npub_me'],
        ['bolt11', 'lnbc...'],
        ['description', JSON.stringify(zapRequest)],
      ],
      content: '',
      id: 'rc_id',
      sig: 'rs',
      created_at: 1,
    };
    onEvent(receipt);
    expect(pushToastMock).toHaveBeenCalledTimes(1);
    const arg = pushToastMock.mock.calls[0][0];
    expect(arg.title).toMatch(/Alice/);
    expect(arg.body).toMatch(/21/);
  });

  it('ignores invalid receipts', () => {
    renderHook(() => useZapReceipts('npub_me'));
    const onEvent = ((enqueueMock.mock.calls[0][0] as unknown) as { onEvent: (e: unknown) => void }).onEvent;
    onEvent({ kind: 1, pubkey: 'x', tags: [], content: '', id: 'i', sig: 's', created_at: 1 });
    expect(pushToastMock).not.toHaveBeenCalled();
  });

  it('deduplicates by receipt id', () => {
    renderHook(() => useZapReceipts('npub_me'));
    const onEvent = ((enqueueMock.mock.calls[0][0] as unknown) as { onEvent: (e: unknown) => void }).onEvent;
    const zapRequest = {
      kind: 9734, pubkey: 'sender_pub',
      tags: [['p', 'npub_me'], ['amount', '21000']],
      content: '', id: 'z', sig: 's', created_at: 1,
    };
    const receipt = {
      kind: 9735, pubkey: 'p',
      tags: [['p', 'npub_me'], ['bolt11', 'lnbc'], ['description', JSON.stringify(zapRequest)]],
      content: '', id: 'recpt_dup', sig: 's', created_at: 1,
    };
    onEvent(receipt);
    onEvent(receipt);
    expect(pushToastMock).toHaveBeenCalledTimes(1);
  });

  it('teardown is called on unmount', () => {
    const teardown = vi.fn();
    enqueueMock.mockReturnValueOnce(teardown);
    const { unmount } = renderHook(() => useZapReceipts('npub_me'));
    unmount();
    expect(teardown).toHaveBeenCalled();
  });
});
