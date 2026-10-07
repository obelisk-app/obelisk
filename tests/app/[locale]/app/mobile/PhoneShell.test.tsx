import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import PhoneShell from '@/app/[locale]/app/mobile/PhoneShell';

vi.mock('@/app/[locale]/app/login/LoginModal', () => ({ default: () => <div data-testid="login-modal" /> }));

describe('PhoneShell for a guest', () => {
  it('shows the login full screen', () => {
    const { getByTestId } = renderWithBridge(<PhoneShell />, fakeBridge({ isLoggedIn: false }, { setActiveGroup: vi.fn(), setActiveDmPeer: vi.fn() } as never));
    expect(getByTestId('login-modal')).toBeInTheDocument();
    expect(document.querySelector('.obelisk-mobile .screens-host [data-screen="login"]')).not.toBeNull();
    expect(document.querySelector('.bottom-nav')).toBeNull();
  });
});
