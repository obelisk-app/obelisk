import type { DeepLinkRelayOutcome } from '@/services/relay/deep-link';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { watchMentionNavigation } from '@/services/notifications/navigation';
import { useChatStore } from '@/store/chat';
import { useNotificationsStore } from '@/store/notifications';
import { sanitizeNotificationsPersisted } from '@/store/notifications/notifications-persist';
import { useToastStore } from '@/store/feedback/toast';
import { fakeBridge } from '@tests/support/fake-bridge';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const target = { relay: 'wss://relay.test', channelId: 'channel', id: 'old-message' };
let stop = () => {};
beforeEach(() => { useChatStore.getState().reset(); useToastStore.setState({ toasts: [] }); });
afterEach(() => { stop(); useChatStore.getState().reset(); });
function setup() {
  const ensureGroupMessage = vi.fn().mockResolvedValue(true);
  const fetchGroupMetadata = vi.fn().mockResolvedValue(false);
  const bridge = fakeBridge({ currentRelayUrl: target.relay, groups: [group({ id: target.channelId })] }, { ensureGroupMessage, fetchGroupMetadata });
  const switchRelay = vi.fn(async (relay: string): Promise<DeepLinkRelayOutcome> => { bridge.stores.currentRelayUrl.set(relay); return 'unchanged'; });
  stop = watchMentionNavigation({ awaitBridge: async () => bridge, switchRelay });
  return { ensureGroupMessage, fetchGroupMetadata, bridge, switchRelay };
}

it('loads the exact target before handing off navigation', async () => {
  const { ensureGroupMessage } = setup();
  useChatStore.getState().requestMentionJump(target);
  await waitFor(() => expect(useChatStore.getState().pendingJump).toEqual({ groupId: target.channelId, messageId: target.id }));
  expect(ensureGroupMessage).toHaveBeenCalledWith(target.channelId, target.id);
});

it('waits for the authorized relay switch and missing metadata before loading the target', async () => {
  const { bridge, switchRelay, fetchGroupMetadata, ensureGroupMessage } = setup();
  bridge.stores.currentRelayUrl.set('wss://other.test');
  bridge.stores.groups.set([]);
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  switchRelay.mockImplementation(async relay => { await gate; bridge.stores.currentRelayUrl.set(relay); return 'unchanged'; });
  fetchGroupMetadata.mockImplementation(async () => { bridge.stores.groups.set([group({ id: target.channelId })]); return true; });
  useChatStore.getState().requestMentionJump(target);
  await waitFor(() => expect(switchRelay).toHaveBeenCalledWith(target.relay));
  expect(ensureGroupMessage).not.toHaveBeenCalled();
  expect(useChatStore.getState().pendingJump).toBeNull();
  finish();
  await waitFor(() => expect(useChatStore.getState().pendingJump?.messageId).toBe(target.id));
  expect(fetchGroupMetadata).toHaveBeenCalledWith(target.channelId);
});

it.each(['missing-channel', 'missing-message', 'query-error'])('shows feedback for %s without navigating elsewhere', async failure => {
  const { bridge, ensureGroupMessage } = setup();
  if (failure === 'missing-channel') bridge.stores.groups.set([]);
  else if (failure === 'missing-message') ensureGroupMessage.mockResolvedValue(false);
  else ensureGroupMessage.mockRejectedValue(new Error('offline'));
  useChatStore.getState().requestMentionJump(target);
  await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
  expect(useChatStore.getState().pendingJump).toBeNull();
  expect(useChatStore.getState().mentionJump).toBeNull();
});

it('restored cards remain navigable after marking the stream read and clearing cards', async () => {
  setup();
  const saved = sanitizeNotificationsPersisted(JSON.parse(JSON.stringify({ mentionsByRelay: { [target.relay]: [{ ...target, senderPubkey: 'sender', preview: 'mention', createdAt: 100 }] } })));
  useNotificationsStore.setState(saved);
  const card = useNotificationsStore.getState().mentionsByRelay[target.relay][0];
  useChatStore.getState().requestMentionJump(card);
  useNotificationsStore.getState().markMentionsRead(target.relay);
  useNotificationsStore.getState().clearMentions(target.relay);
  await waitFor(() => expect(useChatStore.getState().pendingJump?.messageId).toBe(target.id));
});

it('serializes switches and only navigates to the latest of rapid clicks', async () => {
  const { bridge, switchRelay } = setup();
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  switchRelay.mockImplementationOnce(async relay => { await gate; bridge.stores.currentRelayUrl.set(relay); return 'unchanged'; });
  useChatStore.getState().requestMentionJump(target);
  await waitFor(() => expect(switchRelay).toHaveBeenCalledOnce());
  const latest = { ...target, relay: 'wss://latest.test', id: 'latest-message' };
  useChatStore.getState().requestMentionJump(latest);
  expect(switchRelay).toHaveBeenCalledOnce();
  finish();
  await waitFor(() => expect(useChatStore.getState().pendingJump?.messageId).toBe(latest.id));
  expect(switchRelay.mock.calls.map(call => call[0])).toEqual([target.relay, latest.relay]);
});

it('suppresses an in-flight target after logout/reset', async () => {
  const { ensureGroupMessage } = setup();
  let finish!: (found: boolean) => void;
  ensureGroupMessage.mockReturnValue(new Promise<boolean>(resolve => { finish = resolve; }));
  useChatStore.getState().requestMentionJump(target);
  await waitFor(() => expect(ensureGroupMessage).toHaveBeenCalled());
  useChatStore.getState().reset();
  finish(true);
  await Promise.resolve();
  expect(useChatStore.getState().pendingJump).toBeNull();
});

it.each(['declined', 'failed'] as const)('does not load a channel after relay authorization is %s', async outcome => {
  const { switchRelay, ensureGroupMessage, fetchGroupMetadata } = setup();
  switchRelay.mockResolvedValue(outcome);
  useChatStore.getState().requestMentionJump(target);
  await waitFor(() => expect(useChatStore.getState().mentionJump).toBeNull());
  expect(ensureGroupMessage).not.toHaveBeenCalled();
  expect(fetchGroupMetadata).not.toHaveBeenCalled();
  expect(useChatStore.getState().pendingJump).toBeNull();
  expect(useToastStore.getState().toasts).toHaveLength(outcome === 'failed' ? 1 : 0);
});
