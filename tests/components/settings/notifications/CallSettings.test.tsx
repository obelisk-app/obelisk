import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import CallSettings from '@/components/settings/notifications/CallSettings';
import { LocaleProvider } from '@tests/support/intl';
import { DEFAULT_CALL_RELAYS, getPreferences, setPreference } from '@/services/preferences/preferences';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('CallSettings', () => {
  beforeEach(() => {
    setPreference('callsFrom', 'contacts');
    setPreference('callIpProtection', 'auto');
    setPreference('callRelays', [...DEFAULT_CALL_RELAYS]);
  });

  it('sets who can call and IP protection', () => {
    renderLocalized(<CallSettings />);
    expect(screen.getByTestId('calls-from-contacts')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByTestId('calls-from-anyone'));
    expect(getPreferences().callsFrom).toBe('anyone');
    fireEvent.click(screen.getByTestId('call-ip-always'));
    expect(getPreferences().callIpProtection).toBe('always');
  });

  it('saves a valid relay list and refuses a non-wss one', () => {
    renderLocalized(<CallSettings />);
    const inputs = screen.getAllByTestId('call-relay-input');
    fireEvent.change(inputs[0], { target: { value: 'https://not-a-relay.example' } });
    fireEvent.click(screen.getByTestId('call-relay-save'));
    expect(screen.getByRole('status')).toHaveTextContent('Only wss://');
    expect(getPreferences().callRelays).toEqual([...DEFAULT_CALL_RELAYS]);
    fireEvent.change(inputs[0], { target: { value: 'wss://my-call-relay.example' } });
    fireEvent.click(screen.getByTestId('call-relay-save'));
    expect(getPreferences().callRelays[0]).toBe('wss://my-call-relay.example');
  });

  it('names each relay field and marks a non-wss one invalid with a red border', () => {
    renderLocalized(<CallSettings />);
    const [first] = screen.getAllByTestId('call-relay-input');
    expect(first).toHaveAccessibleName(/1$/);
    expect(first).not.toHaveAttribute('aria-invalid');
    expect(first).toHaveClass('font-mono', 'text-xs', 'border-lc-border');
    fireEvent.change(first, { target: { value: 'https://nope.example' } });
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(first).toHaveClass('border-red-500');
  });

  it('adds rows up to the cap, removes them down to one, resets to the defaults, and saves', () => {
    renderLocalized(<CallSettings mobile />);
    expect(screen.getByTestId('call-settings')).toHaveClass('settings-section');
    const add = screen.getByRole('button', { name: 'Add relay' });
    while (screen.getAllByTestId('call-relay-input').length < 4) fireEvent.click(add);
    expect(add).toBeDisabled();
    const removes = () => screen.getAllByRole('button', { name: /^Remove / });
    while (screen.getAllByTestId('call-relay-input').length > 1) fireEvent.click(removes()[0]);
    expect(removes()[0]).toBeDisabled();
    fireEvent.change(screen.getByTestId('call-relay-input'), { target: { value: 'wss://only.example' } });
    fireEvent.click(screen.getByTestId('call-relay-save'));
    expect(getPreferences().callRelays).toEqual(['wss://only.example']);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(screen.getAllByTestId('call-relay-input').map((i) => (i as HTMLInputElement).value)).toEqual([...DEFAULT_CALL_RELAYS]);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('refuses an empty list and a relay with credentials', () => {
    renderLocalized(<CallSettings />);
    const inputs = screen.getAllByTestId('call-relay-input');
    for (const input of inputs) fireEvent.change(input, { target: { value: '  ' } });
    fireEvent.click(screen.getByTestId('call-relay-save'));
    expect(screen.getByRole('status')).toHaveTextContent('Only wss://');
    fireEvent.change(inputs[0], { target: { value: 'wss://user:pw@relay.example' } });
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.click(screen.getByTestId('call-relay-save'));
    expect(screen.getByRole('status')).toHaveTextContent('Only wss://');
    expect(getPreferences().callRelays).toEqual([...DEFAULT_CALL_RELAYS]);
  });
});
