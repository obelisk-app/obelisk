import { clearChannelScrollPositions, getChannelScrollPosition } from '@/utils/chat/timeline/channel-scroll-position';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { useChannelViewport } from '@/hooks/shell/panes/channel/useChannelViewport';
import { usePhoneChannelViewport } from '@/hooks/shell/mobile/screens/channel/usePhoneChannel';
import { useChatStore } from '@/store/chat';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import type { JsMessage } from '@/services/nostr-bridge';

const messages = [{ id: 'target', pubkey: 'author', content: 'mention', createdAt: 1 }] as JsMessage[];
function attachMetrics(node: HTMLDivElement | null) {
  if (!node) return;
  Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 2400 });
  Object.defineProperty(node, 'clientHeight', { configurable: true, value: 400 });
}
function Desktop() {
  const [pendingMessageId, setPending] = useState<string | null>('target');
  const consume = useCallback(() => setPending(null), []);
  const { scrollRef } = useChannelViewport({ groupId: 'room', relay: 'wss://relay.test', myPubkey: null, messages, pendingMessageId, onConsumePendingMessageId: consume });
  return <div ref={node => { attachMetrics(node); scrollRef.current = node; }}><div data-testid="target" data-msg-id="target" /><output>{pendingMessageId ?? 'consumed'}</output></div>;
}
function Phone() {
  const { messagesRef } = usePhoneChannelViewport({ groupId: 'room', relay: 'wss://relay.test', myPubkey: null, messages });
  return <div ref={node => { attachMetrics(node); messagesRef.current = node; }}><div data-testid="target" data-msg-id="target" /></div>;
}
beforeEach(() => {
  useChatStore.getState().reset();
  clearChannelScrollPositions();
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe() { queueMicrotask(() => this.callback([], this as unknown as ResizeObserver)); }
    unobserve() {}
    disconnect() {}
  });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  window.history.replaceState({ nav: { screen: 'channel' }, custom: true }, '', '/app?c=room&m=target');
});
afterEach(() => { vi.unstubAllGlobals(); useChatStore.getState().reset(); });
it.each(['desktop', 'phone'])('scopes the %s flash to its own scroller and only consumes after scrolling', async mode => {
  const outside = document.createElement('div');
  outside.dataset.msgId = 'target';
  document.body.append(outside);
  const wrong = vi.spyOn(outside, 'scrollIntoView');
  useChatStore.getState().requestJump('room', 'target');
  render(mode === 'desktop' ? <Desktop /> : <Phone />, { wrapper: bridgeWrapper(fakeBridge()) });
  const target = screen.getByTestId('target');
  await waitFor(() => expect(target).toHaveClass('ring-1', 'ring-lc-green'));
  expect(wrong).not.toHaveBeenCalled();
  expect(target.parentElement?.scrollTop).toBe(0);
  expect(getChannelScrollPosition('wss://relay.test::room')?.nearBottom).toBe(false);
  if (mode === 'desktop') {
    expect(screen.getByText('consumed')).toBeInTheDocument();
    expect(window.location.search).not.toContain('m=');
    expect(window.history.state.custom).toBe(true);
  } else expect(useChatStore.getState().pendingJump).toBeNull();
  outside.remove();
});
