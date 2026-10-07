import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CALL_RELAYS, getPreferences, setPreference } from '@/services/preferences/preferences';
import { useCallSettings } from '@/hooks/settings/notifications/useCallSettings';

beforeEach(() => {
  setPreference('callsFrom', 'contacts');
  setPreference('callIpProtection', 'auto');
  setPreference('callRelays', [...DEFAULT_CALL_RELAYS]);
});

describe('useCallSettings', () => {
  it('reads and sets who can call and IP protection', () => {
    const { result } = renderHook(() => useCallSettings());
    act(() => result.current.setCallsFrom('anyone'));
    act(() => result.current.setIpProtection('never'));
    expect(result.current.callsFrom).toBe('anyone');
    expect(result.current.ipProtection).toBe('never');
    expect(getPreferences()).toMatchObject({ callsFrom: 'anyone', callIpProtection: 'never' });
  });

  it('keys the relay editor on the saved list and holds the status line', () => {
    const { result } = renderHook(() => useCallSettings());
    expect(result.current.relaysKey).toBe(DEFAULT_CALL_RELAYS.join(' '));
    act(() => setPreference('callRelays', ['wss://x.example']));
    expect(result.current.relaysKey).toBe('wss://x.example');
    act(() => result.current.setStatus('saved'));
    expect(result.current.status).toBe('saved');
  });
});
