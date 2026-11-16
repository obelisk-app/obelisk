import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { JsMessage } from '@/services/nostr-bridge';
import { useConcordMarkRead } from '@/hooks/chat/concord/useConcordMarkRead';
import { useConcordReadStore } from '@/store/chat/concord-read';
import { useConcordNavigation } from '@/store/chat/concord';

afterEach(() => { vi.restoreAllMocks(); useConcordReadStore.getState().reset(null); useConcordNavigation.getState().reset(); });
it('reads only a visible focused chat at the bottom, retaining scroll position during new messages', () => {
  const scope = 'concord:community:channel';
  useConcordReadStore.getState().reset('me');
  useConcordNavigation.getState().selectCommunity('community');
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const element = document.createElement('div');
  element.scrollTo = vi.fn(options => { element.scrollTop = (options as ScrollToOptions).top ?? 0; });
  Object.defineProperties(element, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 200 } });
  const ref = { current: element };
  const message = { id: 'one', pubkey: 'other', createdAt: 1 } as JsMessage;
  const { rerender } = renderHook(({ messages }) => useConcordMarkRead('me', scope, messages, ref), { initialProps: { messages: [message] } });
  expect(useConcordReadStore.getState().cursors[scope]).toBe(1000);
  act(() => { element.scrollTop = 100; element.dispatchEvent(new Event('scroll')); });
  rerender({ messages: [message, { ...message, id: 'two', createdAt: 2 }] });
  expect(element.scrollTop).toBe(100);
  expect(useConcordReadStore.getState().cursors[scope]).toBe(1000);
  act(() => { element.scrollTop = 800; element.dispatchEvent(new Event('scroll')); });
  expect(useConcordReadStore.getState().cursors[scope]).toBe(2000);
});
it('does not acknowledge messages from the phone channel list or an unfocused page', () => {
  useConcordReadStore.getState().reset('me');
  useConcordNavigation.getState().selectCommunity('community', true);
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  const element = document.createElement('div');
  element.scrollTo = vi.fn();
  const { rerender } = renderHook(() => useConcordMarkRead('me', 'concord:community:channel', [{ pubkey: 'other', createdAt: 1 } as JsMessage], { current: element }));
  expect(useConcordReadStore.getState().cursors).toEqual({});
  act(() => useConcordNavigation.getState().setMobileChannelsOpen(false));
  rerender();
  expect(useConcordReadStore.getState().cursors).toEqual({});
});
it('does not acknowledge the chat behind an open search or settings overlay', () => {
  useConcordReadStore.getState().reset('me');
  useConcordNavigation.getState().selectCommunity('community');
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const element = document.createElement('div');
  element.scrollTo = vi.fn();
  renderHook(() => useConcordMarkRead('me', 'concord:community:channel', [{ pubkey: 'other', createdAt: 1 } as JsMessage], { current: element }, true));
  expect(useConcordReadStore.getState().cursors).toEqual({});
});
