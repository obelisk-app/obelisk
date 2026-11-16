import { beforeEach, expect, it } from 'vitest';
import { useConcordNavigation } from '@/store/chat/concord';

beforeEach(() => useConcordNavigation.getState().reset());
it('opens the channel list from the picker, then opens chat only on channel selection', () => {
  useConcordNavigation.getState().selectCommunity('community', true);
  // The SDK resolves a default channel while the visitor is still browsing the list.
  useConcordNavigation.setState({ channelId: 'general', threadId: null });
  expect(useConcordNavigation.getState().mobileChannelsOpen).toBe(true);
  useConcordNavigation.getState().selectChannel('chosen');
  expect(useConcordNavigation.getState()).toMatchObject({ channelId: 'chosen', mobileChannelsOpen: false });
  useConcordNavigation.getState().selectCommunity('community', true);
  expect(useConcordNavigation.getState().mobileChannelsOpen).toBe(true);
});
it('does not carry a mobile list view into an explicit publication or desktop community selection', () => {
  useConcordNavigation.getState().selectCommunity('community', true);
  useConcordNavigation.getState().selectThread('publications', 'thread');
  expect(useConcordNavigation.getState().mobileChannelsOpen).toBe(false);
  useConcordNavigation.getState().selectCommunity('community', true);
  useConcordNavigation.getState().selectCommunity('another');
  expect(useConcordNavigation.getState().mobileChannelsOpen).toBe(false);
});
