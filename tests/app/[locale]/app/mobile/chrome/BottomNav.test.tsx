import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import { BottomNav } from '@/app/[locale]/app/mobile/chrome/BottomNav';
import type { NavState } from '@/utils/shell/mobile/url-state';
import { initialNav } from '@/constants/shell/mobile';

const nav = (over: Partial<NavState>): NavState => ({ ...initialNav, ...over });
const renderNav = (props: Partial<React.ComponentProps<typeof BottomNav>> = {}) => render(
  <LocaleProvider initialLocale="en">
    <BottomNav nav={nav({})} onTabPress={vi.fn()} {...props} />
  </LocaleProvider>,
);

describe('BottomNav', () => {
  it('renders the five tabs in order with their hint anchors', () => {
    renderNav();
    const tabs = screen.getAllByRole('button');
    expect(tabs.map((b) => b.getAttribute('aria-label'))).toEqual(['Servers', 'Feed', 'DMs', 'Inbox', 'You']);
    expect(tabs.map((b) => b.getAttribute('data-tour'))).toEqual([null, 'nav-feed', 'dm-list', 'inbox-tabs', 'profile-button']);
  });

  it('marks the tab of a top-level screen active', () => {
    renderNav({ nav: nav({ screen: 'inbox' }) });
    expect(screen.getByLabelText('Inbox').className).toContain('active');
    expect(screen.getByLabelText('Servers').className).not.toContain('active');
  });

  it('marks the parent tab active on a sub-screen, preferring where the person came from', () => {
    renderNav({ nav: nav({ screen: 'profile-view', parentScreen: 'inbox' }) });
    expect(screen.getByLabelText('Inbox').className).toContain('active');
  });

  it('shows the badges, capped at 99+, and none for zero', () => {
    renderNav({ dmBadge: 4, inboxBadge: 150 });
    expect(screen.getByLabelText('DMs').querySelector('.nav-badge')?.textContent).toBe('4');
    expect(screen.getByLabelText('Inbox').querySelector('.nav-badge')?.textContent).toBe('99+');
    renderNav({ dmBadge: 0 });
    expect(screen.getAllByLabelText('DMs')[1].querySelector('.nav-badge')).toBeNull();
  });

  it('reports the pressed tab', () => {
    const onTabPress = vi.fn();
    renderNav({ onTabPress });
    fireEvent.click(screen.getByLabelText('You'));
    expect(onTabPress).toHaveBeenCalledWith('settings-profile');
  });
});
