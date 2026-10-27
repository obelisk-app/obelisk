/**
 * The fullscreen settings: the neutral close (not a red "destructive"
 * circle), and one avatar fallback shared with the profile editor below it.
 */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { displayNameFor, avatarInitials } from '@/utils/identity/display-name';

vi.mock('@/services/media/blossom', () => ({ uploadToBlossom: vi.fn(), BlossomUploadError: class extends Error {} }));

import { UserSettingsModal } from '@/app/[locale]/app/user-panel/UserSettingsModal';

const PK = '89' + 'f'.repeat(62);

function mount(onDone = vi.fn()) {
  renderWithBridge(
    <UserSettingsModal
      pubkey={PK}
      meta={null}
      displayName={displayNameFor(PK, null)}
      settingsTab="profile"
      setSettingsTab={vi.fn()}
      onDone={onDone}
      onLogout={vi.fn()}
    />,
    fakeBridge({}),
  );
  return { onDone };
}

describe('UserSettingsModal', () => {
  it('closes from a neutral ghost button, not a red one', () => {
    const { onDone } = mount();
    const close = screen.getByTestId('user-settings-close');
    expect(close).toHaveAccessibleName('Close');
    expect(close.className).not.toMatch(/red|danger/);
    fireEvent.click(close);
    expect(onDone).toHaveBeenCalled();
  });

  it('the header avatar and the profile editor show the same fallback letter', () => {
    mount();
    const letter = avatarInitials(null, PK).slice(0, 1);
    const fallbacks = Array.from(document.querySelectorAll('.rounded-full.bg-lc-olive')).map((el) => el.textContent);
    expect(fallbacks.length).toBeGreaterThanOrEqual(2);
    expect(new Set(fallbacks)).toEqual(new Set([letter]));
  });

  it('says "public profile", not "kind-0"', () => {
    mount();
    expect(screen.getByTestId('settings-section-profile').textContent).toContain('your public profile');
    expect(screen.getByTestId('settings-section-profile').textContent).not.toMatch(/kind/i);
  });
});
