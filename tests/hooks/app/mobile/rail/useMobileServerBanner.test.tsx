import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMobileServerBanner } from '@/hooks/app/mobile/rail/useMobileServerBanner';
import { getPreferences } from '@/services/preferences';
import { OPEN_SETTINGS_EVENT, type OpenSettingsDetail } from '@/utils/open-settings';

describe('useMobileServerBanner', () => {
  it('reads host, letter and website from the relay URL, and the social relays from preferences', () => {
    const { result } = renderHook(() => useMobileServerBanner('wss://relay.example'));
    expect(result.current).toMatchObject({ host: 'relay.example', iconFallback: 'R', website: 'https://relay.example' });
    expect(result.current.socialRelays).toEqual(getPreferences().socialRelays);
  });

  it('falls back to O with no relay', () => {
    const { result } = renderHook(() => useMobileServerBanner(null));
    expect(result.current).toMatchObject({ host: '', iconFallback: 'O', website: null });
  });

  it('opens the Relays settings section', () => {
    const seen: OpenSettingsDetail[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent<OpenSettingsDetail>).detail);
    window.addEventListener(OPEN_SETTINGS_EVENT, listener);
    const { result } = renderHook(() => useMobileServerBanner(null));
    result.current.openRelaySettings();
    window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
    expect(seen).toEqual([{ section: 'relays' }]);
  });
});
