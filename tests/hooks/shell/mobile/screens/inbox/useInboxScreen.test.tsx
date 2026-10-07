import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_RELAY } from '@tests/support/mocks/nostr-bridge';
import { useNotificationsStore } from '@/store/notifications';
import { useInboxScreen } from '@/hooks/shell/mobile/screens/inbox/useInboxScreen';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const MENTION = { id: 'n1', relay: BRIDGE_MOCK_RELAY, channelId: 'f1', senderPubkey: 'b'.repeat(64), preview: '', createdAt: 1 };

beforeEach(() => useNotificationsStore.setState({ mentionsByRelay: { [BRIDGE_MOCK_RELAY]: [MENTION] }, dmNotifications: [] } as never));

describe('useInboxScreen', () => {
  it('opens a mention in its channel as the kind it is', () => {
    const selectGroup = vi.fn();
    const { result } = renderHook(() => useInboxScreen(selectGroup), { wrapper: bridgeWrapper(fakeBridge({ groups: [group({ id: 'f1', kind: 'forum' })] })) });
    act(() => result.current.jumpToMention(MENTION));
    expect(selectGroup).toHaveBeenCalledWith('f1', 'forum');
  });

  it('is empty per tab', () => {
    const { result } = renderHook(() => useInboxScreen(vi.fn()), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.isEmpty).toBe(false);
    act(() => result.current.setTab('dms'));
    expect(result.current.isEmpty).toBe(true);
  });
});
