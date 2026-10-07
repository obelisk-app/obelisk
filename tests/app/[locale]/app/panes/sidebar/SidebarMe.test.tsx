/**
 * The account pill at the foot of the sidebar: the name it shows, and the
 * settings panel it opens, from the gear or from an "open settings" request
 * anywhere in the app. The panel itself is stubbed.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { openSettings } from '@/services/settings/open-settings';
import type { JsUserMetadata } from '@/services/nostr-bridge';

vi.mock('@/app/[locale]/app/user-panel/UserPanel', () => ({
  default: ({ initialTab, initialEditing, isMe, onClose }: { initialTab: string; initialEditing: boolean; isMe: boolean; onClose: () => void }) => (
    <div data-testid="user-panel" data-tab={initialTab} data-editing={String(initialEditing)} data-me={String(isMe)}>
      <button type="button" onClick={onClose}>close panel</button>
    </div>
  ),
}));

import { SidebarMe } from '@/app/[locale]/app/panes/sidebar/SidebarMe';

function mount(meta: Partial<JsUserMetadata> | null = null, seed: Record<string, unknown> = {}) {
  const userMetadata = meta ? { [BRIDGE_MOCK_PUBKEY]: userMetadataFixture(meta) } : {};
  return renderWithBridge(<SidebarMe />, fakeBridge({ userMetadata, ...seed }));
}

describe('SidebarMe', () => {
  it('renders nothing when signed out', () => {
    const { container } = mount(null, { myPubkey: null });
    expect(container.innerHTML).toBe('');
  });

  it('shows the display name, else the name, else "You"', () => {
    const { unmount } = mount({ displayName: 'Ana', name: 'ana' });
    expect(screen.getByTestId('sidebar-profile-button').textContent).toContain('Ana');
    unmount();
    const second = mount({ name: 'ana' });
    expect(screen.getByTestId('sidebar-profile-button').textContent).toContain('ana');
    second.unmount();
    mount();
    expect(screen.getByTestId('sidebar-profile-button').textContent).toContain('You');
  });

  it('shows a NIP-05 without the "_@" of a root identifier', () => {
    mount({ nip05: '_@example.com' });
    expect(screen.getByTestId('sidebar-profile-handle').textContent).toBe('example.com');
  });

  it('the gear opens the panel on general settings, and it closes', () => {
    mount();
    fireEvent.click(screen.getByTestId('user-settings-button'));
    const panel = screen.getByTestId('user-panel');
    expect(panel.dataset).toMatchObject({ tab: 'general', editing: 'true', me: 'true' });
    fireEvent.click(screen.getByText('close panel'));
    expect(screen.queryByTestId('user-panel')).toBeNull();
  });

  it('an open-settings request opens the panel on that section, then a gear click lands on general again', () => {
    mount();
    act(() => openSettings('relays'));
    expect(screen.getByTestId('user-panel').dataset.tab).toBe('relays');
    fireEvent.click(screen.getByText('close panel'));
    fireEvent.click(screen.getByTestId('user-settings-button'));
    expect(screen.getByTestId('user-panel').dataset.tab).toBe('general');
  });
});
