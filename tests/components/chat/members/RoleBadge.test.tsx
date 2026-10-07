import { beforeEach, describe, expect, it } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { render, screen } from '@testing-library/react';
import RoleBadge from '@/components/chat/members/RoleBadge';
import { useChatStore } from '@/store/chat';

const ALICE = 'a'.repeat(64);
const MOD = { id: 'mod', name: 'Moderator', tier: 3, color: '#ff0000', emoji: '🛡️' };
const OG = { id: 'og', name: 'OG', tier: 1, color: '#00ff00', emoji: '' };


/** The component reads its copy from the dictionary, so it needs a provider. */
const Wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const renderLocalized = (ui: ReactElement) => render(ui, { wrapper: Wrapper });
describe('RoleBadge', () => {
  beforeEach(() => useChatStore.setState(useChatStore.getInitialState()));

  it('shows only the highest-tier role a user holds', () => {
    useChatStore.getState().setRolesByPubkey({ [ALICE]: [MOD, OG] });
    renderLocalized(<RoleBadge pubkey={ALICE} />);

    const badge = screen.getByTestId('role-badge');
    expect(badge).toHaveTextContent('🛡️');
    expect(badge).toHaveTextContent('Moderator');
    expect(badge).toHaveAttribute('title', 'Role: 🛡️ Moderator');
    expect(badge).toHaveAttribute('data-role-id', 'mod');
    expect(badge).toHaveStyle({ color: '#ff0000' });
    expect(screen.queryByText('OG')).not.toBeInTheDocument();
  });

  it('falls back to the next role when the top one is revoked', () => {
    useChatStore.getState().setRolesByPubkey({ [ALICE]: [MOD, OG] });
    const { rerender } = renderLocalized(<RoleBadge pubkey={ALICE} />);

    useChatStore.getState().setRolesByPubkey({ [ALICE]: [OG] });
    rerender(<RoleBadge pubkey={ALICE} />);

    expect(screen.getByTestId('role-badge')).toHaveTextContent('OG');
  });

  it('renders nothing for a user with no roles', () => {
    useChatStore.getState().setRolesByPubkey({ [ALICE]: [MOD] });
    const { container } = renderLocalized(<RoleBadge pubkey={'b'.repeat(64)} />);

    expect(container).toBeEmptyDOMElement();
  });
});
