import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useConcordLocation } from '@/hooks/chat/concord/useConcordLocation';
import { useConcordNavigation } from '@/store/chat/concord';

beforeEach(() => {
  useConcordNavigation.getState().reset();
  window.history.replaceState({ custom: true }, '', '/es/app?relay=previous.example&c=old');
});

it('replaces stale relay/channel coordinates with the selected Concord identifiers', () => {
  renderHook(() => useConcordLocation(true));
  act(() => useConcordNavigation.setState({ open: true, communityId: 'community', channelId: 'channel' }));
  expect(window.location.pathname + window.location.search + window.location.hash).toBe('/es/app#concord=community&channel=channel');
  expect(window.history.state.custom).toBe(true);
});

it('restores a direct URL and follows browser history without overwriting the destination', () => {
  window.history.replaceState({}, '', '/app#concord=community&channel=first');
  renderHook(() => useConcordLocation(true));
  expect(useConcordNavigation.getState()).toMatchObject({ open: true, communityId: 'community', channelId: 'first' });
  act(() => {
    window.history.replaceState({}, '', '/app#concord=community&channel=second');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(useConcordNavigation.getState().channelId).toBe('second');
  act(() => {
    window.history.replaceState({}, '', '/app?relay=example.com');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(useConcordNavigation.getState().open).toBe(false);
});
