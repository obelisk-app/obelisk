import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const RELAY = 'wss://relay.example';
const loaded: { current: Array<{ id: string; createdAt: number }> } = { current: [] };
vi.mock('@/lib/nostr-bridge', () => ({
  useCurrentRelayUrl: () => RELAY,
  useMessages: () => loaded.current,
}));

import { MENTION_MISSING_DWELL_MS, MENTION_SEEN_DWELL_MS, useMentionSeen } from './useMentionSeen';
import { useChatStore } from '@/store/chat';
import { NOTIFICATIONS_INITIAL, getUnreadMentionCount, useNotificationsStore } from '@/store/notifications';

const ID = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

/** IntersectionObserver whose visibility the test drives. */
class FakeIO {
  static instances: FakeIO[] = [];
  observed = new Set<Element>();
  constructor(private cb: IntersectionObserverCallback) { FakeIO.instances.push(this); }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() { this.observed.clear(); }
  show(el: Element, ratio: number, visiblePx = 20) {
    if (!this.observed.has(el)) return;
    this.cb([{
      target: el,
      isIntersecting: ratio > 0,
      intersectionRatio: ratio,
      intersectionRect: { height: ratio > 0 ? visiblePx : 0 },
      rootBounds: { height: 800 },
    } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
const showAll = (el: Element, ratio: number, px?: number) => FakeIO.instances.forEach((io) => io.show(el, ratio, px));

function row(id: string): HTMLElement {
  const el = document.createElement('div');
  el.dataset.msgId = id;
  document.body.appendChild(el);
  return el;
}

describe('useMentionSeen', () => {
  let focused = true;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeIO.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIO);
    focused = true;
    vi.spyOn(document, 'hasFocus').mockImplementation(() => focused);
    document.body.innerHTML = '';
    useNotificationsStore.setState({ ...NOTIFICATIONS_INITIAL });
    useChatStore.setState({ activeChannelId: 'ch1', isNearBottom: true });
    loaded.current = [];
    for (const id of [ID, OTHER]) {
      useNotificationsStore.getState().pushMention({
        id, relay: RELAY, channelId: id === ID ? 'ch1' : 'ch2', senderPubkey: 'p', preview: '', createdAt: 5_000,
      });
    }
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stays unread while the channel is open but the message is off screen', () => {
    row(ID);
    renderHook(() => useMentionSeen());
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(getUnreadMentionCount(RELAY)).toBe(2);
  });

  it('marks it seen after it has been on screen for the dwell time', () => {
    const el = row(ID);
    renderHook(() => useMentionSeen());
    act(() => { showAll(el, 1); });
    act(() => { vi.advanceTimersByTime(MENTION_SEEN_DWELL_MS - 300); });
    expect(getUnreadMentionCount(RELAY)).toBe(2);
    act(() => { vi.advanceTimersByTime(600); });
    expect(getUnreadMentionCount(RELAY)).toBe(1);
    expect(useNotificationsStore.getState().mentionsByRelay[RELAY].find((m) => m.id === ID)?.seen).toBe(true);
  });

  it('a flick past it, or a barely-visible row, does not count', () => {
    const el = row(ID);
    renderHook(() => useMentionSeen());
    act(() => { showAll(el, 1); vi.advanceTimersByTime(400); showAll(el, 0); });
    act(() => { showAll(el, 0.2); vi.advanceTimersByTime(5_000); });
    expect(getUnreadMentionCount(RELAY)).toBe(2);
  });

  it('does not count while the window is unfocused', () => {
    const el = row(ID);
    focused = false;
    renderHook(() => useMentionSeen());
    act(() => { showAll(el, 1); vi.advanceTimersByTime(5_000); });
    expect(getUnreadMentionCount(RELAY)).toBe(2);
    focused = true;
    act(() => { vi.advanceTimersByTime(MENTION_SEEN_DWELL_MS + 300); });
    expect(getUnreadMentionCount(RELAY)).toBe(1);
  });

  it('finds rows that render after the channel opened', () => {
    renderHook(() => useMentionSeen());
    act(() => { vi.advanceTimersByTime(1_000); });
    const el = row(ID);
    act(() => { vi.advanceTimersByTime(300); });
    act(() => { showAll(el, 1); vi.advanceTimersByTime(MENTION_SEEN_DWELL_MS + 300); });
    expect(getUnreadMentionCount(RELAY)).toBe(1);
  });

  it('ignores mentions in other channels', () => {
    const el = row(OTHER);
    renderHook(() => useMentionSeen());
    act(() => { showAll(el, 1); vi.advanceTimersByTime(5_000); });
    expect(useNotificationsStore.getState().mentionsByRelay[RELAY].find((m) => m.id === OTHER)?.seen).toBeUndefined();
  });

  it('a message taller than the viewport counts once it fills enough of it', () => {
    const el = row(ID);
    renderHook(() => useMentionSeen());
    // 30% of a very tall message, but that 30% is 500px of an 800px viewport.
    act(() => { showAll(el, 0.3, 500); vi.advanceTimersByTime(MENTION_SEEN_DWELL_MS + 300); });
    expect(getUnreadMentionCount(RELAY)).toBe(1);
  });

  it('a card whose message is not in the loaded channel clears once the user watches the channel', () => {
    // Channel loaded from t=1s onward; the mention (t=5s) should be there but isn't (deleted).
    loaded.current = [{ id: 'x'.repeat(64), createdAt: 1 }, { id: 'y'.repeat(64), createdAt: 9 }];
    renderHook(() => useMentionSeen());
    act(() => { vi.advanceTimersByTime(MENTION_MISSING_DWELL_MS + 300); });
    expect(useNotificationsStore.getState().mentionsByRelay[RELAY].find((m) => m.id === ID)?.seen).toBe(true);
  });

  it('keeps a card whose message is older than the loaded window (scroll up / click the card to see it)', () => {
    loaded.current = [{ id: 'x'.repeat(64), createdAt: 10 }];
    renderHook(() => useMentionSeen());
    act(() => { vi.advanceTimersByTime(MENTION_MISSING_DWELL_MS * 3); });
    expect(useNotificationsStore.getState().mentionsByRelay[RELAY].find((m) => m.id === ID)?.seen).toBeUndefined();
  });

  it('does not clear a missing-message card when the user is not watching', () => {
    loaded.current = [{ id: 'x'.repeat(64), createdAt: 1 }];
    focused = false;
    renderHook(() => useMentionSeen());
    act(() => { vi.advanceTimersByTime(MENTION_MISSING_DWELL_MS * 3); });
    expect(useNotificationsStore.getState().mentionsByRelay[RELAY].find((m) => m.id === ID)?.seen).toBeUndefined();
  });
});
