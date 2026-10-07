import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useChatStore } from '@/store/chat';
import { presenceActivityKey } from '@/utils/chat/members/presence';
import { useMemberListScreen } from '@/hooks/shell/mobile/screens/channel/useMemberListScreen';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

vi.mock('@/hooks/chat/members/useNostrPresence', async (orig) => ({
  ...(await orig<typeof import('@/hooks/chat/members/useNostrPresence')>()),
  useNostrPresence: () => {},
}));

const RELAY = 'wss://relay.test';
const run = (seed: Parameters<typeof fakeBridge>[0]) =>
  renderHook(() => useMemberListScreen('g1'), {
    wrapper: bridgeWrapper(fakeBridge({ currentRelayUrl: RELAY, groups: [group({ id: 'g1', name: 'general', parent: 'p' }), group({ id: 'p', name: 'Space' })], ...seed })),
  }).result.current;

beforeEach(() => useChatStore.setState(useChatStore.getInitialState()));

describe('useMemberListScreen', () => {
  it('heads with the channel, counts everyone once and who is online', () => {
    useChatStore.setState({ lastActivityAt: { [presenceActivityKey(RELAY, 'b')]: Date.now() } });
    const vm = run({ adminsByGroup: { g1: ['a'] }, membersByGroup: { g1: ['a', 'b', 'c'] }, membershipReadyByGroup: { g1: true } });
    expect(vm.header).toEqual({ category: 'Space', channel: 'general' });
    expect(vm.total).toBe(3);
    expect(vm.onlineCount).toBe(1);
    expect(vm.isOnline('b')).toBe(true);
    expect(vm.sections).toEqual([{ key: 'member', label: 'Members', pubkeys: ['b', 'c'] }]);
  });

  it('is loading until membership is known, then empty', () => {
    expect(run({})).toMatchObject({ loading: true, empty: false });
    expect(run({ membershipReadyByGroup: { g1: true } })).toMatchObject({ loading: false, empty: true });
  });
});
