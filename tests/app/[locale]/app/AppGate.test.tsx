import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({ default: () => () => <div data-testid="shell" /> }));
vi.mock('@/components/read-state/ReadStateRoot', () => ({ default: () => null }));
vi.mock('@/components/feedback/ActivityIndicator', () => ({
  default: () => <div data-testid="desktop-activity-indicator" />,
}));

import { setActiveVoiceClient } from '@/services/voice/active-client';
import type { RemoteTrack, VoiceClient } from '@/services/voice/client';

import AppGate from '@/app/[locale]/app/AppGate';
import { LocaleProvider } from '@tests/support/intl';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

describe('AppGate shared runtime', () => {
  afterEach(() => {
    cleanup();
    setActiveVoiceClient(null);
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it('keeps the same voice audio element across layout changes and releases it on logout', async () => {
    const query = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.mocked(window.matchMedia).mockReturnValue(query as unknown as MediaQueryList);
    const stream = { id: 'remote-voice' } as MediaStream;
    const unsubscribe = vi.fn();
    setActiveVoiceClient({
      subscribeRemoteTracks(listener: (tracks: RemoteTrack[]) => void) {
        listener([{ pubkey: 'peer', viaPubkey: 'peer', trackId: 'voice', kind: 'audio', stream }]);
        return unsubscribe;
      },
    } as unknown as VoiceClient);
    const fake = fakeBridge({ isLoggedIn: true });
    const { container } = renderWithBridge(<LocaleProvider initialLocale="en"><AppGate /></LocaleProvider>, fake);
    await waitFor(() => expect(container.querySelector('audio')).not.toBeNull());
    const audio = container.querySelector('audio');
    expect(audio?.srcObject).toBe(stream);

    const onChange = query.addEventListener.mock.calls.find(([event]) => event === 'change')![1];
    for (const mobile of [false, true]) {
      act(() => { query.matches = mobile; onChange(); });
      expect(container.querySelectorAll('audio')).toHaveLength(1);
      expect(container.querySelector('audio')).toBe(audio);
      expect(unsubscribe).not.toHaveBeenCalled();
    }

    act(() => fake.stores.isLoggedIn.set(false));
    expect(container.querySelector('audio')).toBeNull();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not mount the desktop activity notification stack on mobile', async () => {
    renderWithBridge(<LocaleProvider initialLocale="en"><AppGate /></LocaleProvider>, fakeBridge({ isLoggedIn: true }));

    await waitFor(() => expect(screen.getByTestId('shell')).toBeInTheDocument());
    expect(screen.queryByTestId('desktop-activity-indicator')).toBeNull();
  });
});
