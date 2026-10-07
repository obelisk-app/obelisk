/**
 * The desktop sidebar: which channels sit at the root of the tree, the
 * loading and empty states, and the create form gated on relay access. The
 * operator data is stubbed (its own hooks are tested in `useSidebarData`).
 */
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_RELAY, groupFixture, messageFixture } from '@tests/support/mocks/nostr-bridge';
import { EMPTY_LAYOUT, type ChannelLayout } from '@/services/relay/channel-layout';
import { EMPTY_BRANDING } from '@/services/relay/relay-branding';
import { EMPTY_RELAY_EMOJI_SET } from '@/services/relay/relay-emojis';
import { EMPTY_RELAY_ROLES } from '@/services/relay/relay-roles';
import { useVoiceStore } from '@/store/voice';
import type { JsGroup } from '@/services/nostr-bridge';

const operator = vi.hoisted(() => ({ layout: null as unknown }));
vi.mock('@/hooks/shell/panes/sidebar/useSidebarData', () => ({
  useSidebarOperatorData: () => ({
    operatorPubkey: null,
    isRelayOperator: false,
    layout: operator.layout,
    branding: EMPTY_BRANDING,
    emojiSet: EMPTY_RELAY_EMOJI_SET,
    relayRoles: EMPTY_RELAY_ROLES,
    brandingLoaded: true,
    showTitleSkeleton: false,
  }),
  useGroupWotDistances: () => ({}),
}));

import { Sidebar } from '@/app/[locale]/app/panes/sidebar/Sidebar';

const groups: JsGroup[] = [
  groupFixture({ id: 'g1', name: 'general' }),
  groupFixture({ id: 'f1', name: 'pubs', kind: 'forum' }),
  groupFixture({ id: 't1', name: 'a thread', parent: 'f1' }),
  groupFixture({ id: 'o1', name: 'orphan', parent: 'gone' }),
];

function mount(seed: Record<string, unknown> = {}) {
  const setView = vi.fn();
  renderWithBridge(
    <Sidebar relay={BRIDGE_MOCK_RELAY} conn="Connected" view={{ kind: 'group', groupId: 'g1' }} setView={setView} />,
    fakeBridge({
      groups,
      childrenByParent: { f1: ['t1'] },
      messagesByGroup: { t1: [messageFixture({ id: 'm', createdAt: 1 })] },
      ...seed,
    }),
  );
  return { setView };
}

beforeEach(() => {
  operator.layout = EMPTY_LAYOUT;
  useVoiceStore.setState({ currentVoiceChannelId: null });
});

describe('Sidebar', () => {
  it('roots the tree at channels with no parent or a parent it does not know', () => {
    mount();
    const rows = screen.getAllByTestId(/^channel-row-/).map((r) => r.dataset.testid);
    expect(rows).toEqual(['channel-row-g1', 'channel-row-f1', 'channel-row-t1', 'channel-row-o1']);
    expect(screen.getByTestId('channel-row-t1').closest('.lc-forum-threads')).not.toBeNull();
    expect(screen.getByTestId('channel-row-o1').closest('.lc-forum-threads')).toBeNull();
  });

  it('applies the operator layout to the root channels', () => {
    operator.layout = {
      ...EMPTY_LAYOUT,
      categories: [{ id: 'c1', name: 'Talk' }],
      channels: [{ id: 'o1', categoryId: 'c1' }],
    } as unknown as ChannelLayout;
    mount();
    expect(screen.getByRole('button', { name: /Talk/ }).textContent).toBe('Talk1');
    expect(screen.getByRole('button', { name: /Uncategorized/ }).textContent).toBe('Uncategorized2');
  });

  it('a click on a channel opens it', () => {
    const { setView } = mount();
    fireEvent.click(screen.getByText('orphan'));
    expect(setView).toHaveBeenCalledWith({ kind: 'group', groupId: 'o1' });
  });

  it('offers the create form, counting every channel', () => {
    mount();
    expect(screen.getByText('Channels · 4')).toBeInTheDocument();
  });

  it('shows the loading state until the channel list has arrived, then the empty one', () => {
    mount({ groups: [], groupMetadataEose: false });
    expect(screen.getByTestId('channels-loading')).toBeInTheDocument();
  });

  it('says so when the relay has no channels', () => {
    mount({ groups: [], groupMetadataEose: true });
    expect(screen.getByTestId('channels-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('channels-loading')).toBeNull();
  });

  it('without relay access: no create form and no empty-state copy, but cached channels still show', () => {
    mount({ relayAccess: {} });
    expect(screen.queryByText('Channels · 4')).toBeNull();
    expect(screen.getByTestId('channel-row-g1')).toBeInTheDocument();
  });

  it('leaves room for the floating user panel', () => {
    mount();
    expect(document.querySelector('[data-tour="channels-list"]')!.className).toContain('md:pb-28');
  });

  it('pads further while in a voice call', () => {
    useVoiceStore.setState({ currentVoiceChannelId: 'v1' });
    mount();
    expect(document.querySelector('[data-tour="channels-list"]')!.className).toContain('md:pb-52');
  });
});
