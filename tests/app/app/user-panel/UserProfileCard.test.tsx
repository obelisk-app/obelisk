import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import type { JsUserMetadata } from '@/services/nostr-bridge';
import { UserProfileCard } from '@/app/app/user-panel/UserProfileCard';

const PUBKEY = 'a'.repeat(64);
const NPUB = 'npub1test';

function meta(banner: string): JsUserMetadata {
  return { pubkey: PUBKEY, name: null, displayName: null, picture: null, about: null, nip05: null, banner, lud16: null, website: null };
}

function mount(isMe: boolean) {
  const onEdit = vi.fn();
  const onLogout = vi.fn();
  render(
    <LocaleProvider initialLocale="en">
      <UserProfileCard
        pubkey={PUBKEY}
        meta={meta('https://cdn.example/banner.png')}
        displayName="Alice"
        npub={NPUB}
        isMe={isMe}
        style={{}}
        onClose={vi.fn()}
        onEdit={onEdit}
        onLogout={onLogout}
      />
    </LocaleProvider>,
  );
  return { onEdit, onLogout };
}

describe('UserProfileCard', () => {
  it('lists its actions as shared menu rows, with the profile link opening in a new tab', () => {
    mount(false);
    const menu = screen.getByRole('menu', { name: 'Alice' });
    const rows = screen.getAllByRole('menuitem');
    expect(rows).toHaveLength(3);
    rows.forEach((row) => expect(menu).toContainElement(row));
    const link = rows[2];
    expect(link).toHaveAttribute('href', `/p/${NPUB}`);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('adds edit and a red log out for your own card', () => {
    const { onEdit, onLogout } = mount(true);
    const rows = screen.getAllByRole('menuitem');
    expect(rows).toHaveLength(5);
    fireEvent.click(rows[3]);
    fireEvent.click(rows[4]);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(rows[4].className).toContain('text-red-400');
  });

  it('loads the banner without sending a referrer', () => {
    render(
      <LocaleProvider initialLocale="en">
        <UserProfileCard pubkey={PUBKEY} meta={meta('https://cdn.example/b.png')} displayName="B" npub={null} isMe={false} style={{}} onClose={vi.fn()} onEdit={vi.fn()} onLogout={vi.fn()} />
      </LocaleProvider>,
    );
    const banner = document.querySelector('img[src="https://cdn.example/b.png"]');
    expect(banner).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(banner).toHaveAttribute('loading', 'lazy');
  });
});
