import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import CallSettings from '@/components/settings/CallSettings';
import { LocaleProvider } from '@/i18n/context';
import { DEFAULT_CALL_RELAYS, getPreferences, setPreference } from '@/services/preferences';

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
});
