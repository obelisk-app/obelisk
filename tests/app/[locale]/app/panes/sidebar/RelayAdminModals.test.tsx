/**
 * The server-settings menu and the five operator editors it opens. The
 * editors are stubbed: this pins which one opens, for whom, and what it is
 * handed, not the editors themselves.
 */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { EMPTY_LAYOUT } from '@/constants/relay/channel-layout';
import { EMPTY_BRANDING } from '@/constants/relay/relay-branding';
import { EMPTY_RELAY_EMOJI_SET } from '@/constants/relay/relay-emojis';
import { EMPTY_RELAY_ROLES } from '@/services/relay/relay-roles';

const editor = vi.hoisted(() => (testId: string) => function EditorStub(
  { onClose, ...rest }: { onClose: () => void } & Record<string, unknown>,
) {
  return (
    <div data-testid={testId} data-props={JSON.stringify(Object.keys(rest).sort())} data-relays={JSON.stringify(rest.configuredRelays ?? null)}>
      <button type="button" onClick={onClose}>close {testId}</button>
    </div>
  );
});

vi.mock('@/app/[locale]/app/modals/relay/RelaySettingsModal', () => ({
  RelaySettingsModal: (p: Record<string, () => void>) => (
    <div data-testid="settings">
      {['onClose', 'onBranding', 'onEmojis', 'onLayout', 'onMembers', 'onRoles'].map((k) => (
        <button key={k} type="button" onClick={p[k]}>{k}</button>
      ))}
    </div>
  ),
}));
vi.mock('@/app/[locale]/app/modals/layout/ManageLayoutModal', () => ({ ManageLayoutModal: editor('layout') }));
vi.mock('@/app/[locale]/app/modals/relay/RelayBrandingModal', () => ({ RelayBrandingModal: editor('branding') }));
vi.mock('@/components/admin/relay-emoji/RelayEmojiAdminModal', () => ({ default: editor('emojis') }));
vi.mock('@/components/admin/relay-admin/RelayAdminPanel', () => ({ default: editor('members') }));
vi.mock('@/components/admin/relay-roles/RelayRolesAdminModal', () => ({ default: editor('roles') }));

import { RelayAdminModals } from '@/app/[locale]/app/panes/sidebar/RelayAdminModals';

function mount({ relay = 'wss://relay.test', isRelayOperator = true, settingsOpen = true } = {}) {
  const onCloseSettings = vi.fn();
  renderWithBridge(
    <RelayAdminModals
      relay={relay}
      isRelayOperator={isRelayOperator}
      settingsOpen={settingsOpen}
      onCloseSettings={onCloseSettings}
      layout={EMPTY_LAYOUT}
      channels={[groupFixture({ id: 'g1' })]}
      branding={EMPTY_BRANDING}
      emojiSet={EMPTY_RELAY_EMOJI_SET}
      relayRoles={EMPTY_RELAY_ROLES}
    />,
    fakeBridge({ configuredRelays: ['wss://relay.test', 'wss://other.test'] }),
  );
  return { onCloseSettings };
}

describe('RelayAdminModals', () => {
  it('renders nothing for someone who is not the operator', () => {
    mount({ isRelayOperator: false });
    expect(screen.queryByTestId('settings')).toBeNull();
  });

  it('renders nothing while the settings menu is closed', () => {
    mount({ settingsOpen: false });
    expect(screen.queryByTestId('settings')).toBeNull();
  });

  it('the menu closes through its owner', () => {
    const { onCloseSettings } = mount();
    fireEvent.click(screen.getByText('onClose'));
    expect(onCloseSettings).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['onBranding', 'branding'],
    ['onEmojis', 'emojis'],
    ['onLayout', 'layout'],
    ['onMembers', 'members'],
    ['onRoles', 'roles'],
  ])('%s opens the %s editor over the menu, and it closes on its own', (button, testId) => {
    mount();
    fireEvent.click(screen.getByText(button));
    expect(screen.getByTestId(testId)).toBeInTheDocument();
    expect(screen.getByTestId('settings')).toBeInTheDocument();
    fireEvent.click(screen.getByText(`close ${testId}`));
    expect(screen.queryByTestId(testId)).toBeNull();
  });

  it('editors can be open together', () => {
    mount();
    fireEvent.click(screen.getByText('onBranding'));
    fireEvent.click(screen.getByText('onRoles'));
    expect(screen.getByTestId('branding')).toBeInTheDocument();
    expect(screen.getByTestId('roles')).toBeInTheDocument();
  });

  it('hands each editor what it edits; the emoji editor gets the configured relays', () => {
    mount();
    for (const b of ['onBranding', 'onEmojis', 'onLayout', 'onRoles']) fireEvent.click(screen.getByText(b));
    expect(JSON.parse(screen.getByTestId('layout').dataset.props!)).toEqual(['channels', 'layout', 'relayUrl']);
    expect(JSON.parse(screen.getByTestId('branding').dataset.props!)).toEqual(['branding', 'relayUrl']);
    expect(JSON.parse(screen.getByTestId('roles').dataset.props!)).toEqual(['relayUrl', 'roles']);
    expect(JSON.parse(screen.getByTestId('emojis').dataset.relays!)).toEqual(['wss://relay.test', 'wss://other.test']);
  });

  it('with no relay only the members panel can open', () => {
    mount({ relay: '' });
    for (const b of ['onBranding', 'onEmojis', 'onLayout', 'onRoles', 'onMembers']) fireEvent.click(screen.getByText(b));
    for (const id of ['branding', 'emojis', 'layout', 'roles']) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.getByTestId('members')).toBeInTheDocument();
  });
});
