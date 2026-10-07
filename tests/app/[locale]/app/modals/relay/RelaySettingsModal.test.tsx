import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { RelaySettingsModal } from '@/app/[locale]/app/modals/relay/RelaySettingsModal';

function mount() {
  const calls: string[] = [];
  const spy = (name: string) => vi.fn(() => { calls.push(name); });
  const props = {
    onClose: spy('close'), onBranding: spy('branding'), onEmojis: spy('emojis'),
    onLayout: spy('layout'), onMembers: spy('members'), onRoles: spy('roles'),
  };
  render(<LocaleProvider initialLocale="en"><RelaySettingsModal {...props} /></LocaleProvider>);
  return calls;
}

const entry = (icon: string) => screen.getByTestId(`server-settings-icon-${icon}`).closest('button')!;

describe('RelaySettingsModal', () => {
  it('lists the five destinations in order', () => {
    mount();
    expect(screen.getAllByTestId(/^server-settings-icon-/).map((el) => el.dataset.testid)).toEqual([
      'server-settings-icon-profile', 'server-settings-icon-emoji', 'server-settings-icon-channels',
      'server-settings-icon-roles', 'server-settings-icon-members',
    ]);
  });

  it.each([
    ['profile', 'branding'], ['emoji', 'emojis'], ['channels', 'layout'], ['roles', 'roles'], ['members', 'members'],
  ])('the %s entry closes the menu, then opens %s', (icon, action) => {
    const calls = mount();
    fireEvent.click(entry(icon));
    expect(calls).toEqual(['close', action]);
  });
});
