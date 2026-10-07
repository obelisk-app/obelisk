import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { useChatStore } from '@/store/chat';
import { presenceActivityKey } from '@/utils/chat/members/presence';
import { MemberListScreen } from '@/app/[locale]/app/mobile/screens/channel/MemberListScreen';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

vi.mock('@/hooks/chat/members/useNostrPresence', async (orig) => ({
  ...(await orig<typeof import('@/hooks/chat/members/useNostrPresence')>()),
  useNostrPresence: () => {},
}));

const RELAY = 'wss://relay.test';
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

function mount(seed: Parameters<typeof fakeBridge>[0] = {}) {
  const openProfile = vi.fn();
  const back = vi.fn();
  renderWithBridge(
    <MemberListScreen groupId="g1" back={back} openProfile={openProfile} />,
    fakeBridge({
      currentRelayUrl: RELAY,
      groups: [group({ id: 'g1', name: 'general' })],
      adminsByGroup: { g1: [A] },
      membersByGroup: { g1: [A, B, C] },
      membershipReadyByGroup: { g1: true },
      ...seed,
    }, { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) } as never),
  );
  return { openProfile, back };
}

beforeEach(() => useChatStore.setState(useChatStore.getInitialState()));

describe('MemberListScreen (phone) presence and states', () => {
  it('counts who was active in the last window out of everyone, admins once', () => {
    useChatStore.setState({ lastActivityAt: { [presenceActivityKey(RELAY, A)]: Date.now(), [presenceActivityKey(RELAY, C)]: Date.now() - 60 * 60 * 1000 } });
    mount();
    expect(document.querySelector('.member-presence-count')?.textContent).toBe('1/3');
    const rows = document.querySelectorAll('.member-row');
    expect(rows[0].querySelector('.member-row-presence')).toHaveClass('on');
    expect(rows[0].querySelector('.dm-ava-list')).not.toHaveClass('offline');
    expect(rows[1].querySelector('.member-row-presence')).toHaveClass('off');
    expect(rows[1].querySelector('.dm-ava-list')).toHaveClass('offline');
  });

  it('opens a profile from a row and goes back from the header', () => {
    const { openProfile, back } = mount();
    fireEvent.click(document.querySelectorAll('.member-row')[1]);
    expect(openProfile).toHaveBeenCalledWith(B);
    fireEvent.click(document.querySelector('.chat-title-block button')!);
    expect(back).toHaveBeenCalled();
  });

  it('labels the admins with an admin badge', () => {
    mount();
    expect(document.querySelectorAll('.member-row')[0].querySelector('.role-badge.b-core')).not.toBeNull();
    expect(document.querySelectorAll('.member-row')[1].querySelector('.role-badge.b-core')).toBeNull();
  });

  it('shows a spinner until membership is known, then an empty state', () => {
    mount({ adminsByGroup: {}, membersByGroup: {}, membershipReadyByGroup: {} });
    expect(screen.getByTestId('members-loading')).toBeInTheDocument();
  });

  it('says the channel is empty once membership is known', () => {
    mount({ adminsByGroup: {}, membersByGroup: {} });
    expect(screen.queryByTestId('members-loading')).toBeNull();
    expect(document.querySelector('.empty-state .empty-state-title')).not.toBeNull();
  });
});
