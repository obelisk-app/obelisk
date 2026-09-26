import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import VoiceStatusBar from './VoiceStatusBar';
import { useVoiceStore } from '@/store/voice';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/lib/nostr-bridge', () => ({
  useGroups: () => [{ id: 'ch1', name: 'Lounge' }],
}));
vi.mock('@/lib/voice/active-client', () => ({
  getActiveVoiceClient: () => null,
  setActiveVoiceClient: () => {},
}));
vi.mock('@/lib/voice/jump-to-voice', () => ({ requestVoiceJump: () => {} }));

const renderBar = () => render(
  <LocaleProvider initialLocale="en"><VoiceStatusBar /></LocaleProvider>,
);

beforeEach(() => {
  useVoiceStore.setState({ currentVoiceChannelId: 'ch1', isSignalingDegraded: false });
});
afterEach(() => {
  cleanup();
  useVoiceStore.getState().leaveVoice();
});

describe('VoiceStatusBar', () => {
  it('shows "Voice connected" while signaling is healthy', () => {
    renderBar();
    expect(screen.getByText('Voice connected')).toBeTruthy();
    expect(screen.queryByTestId('voice-bar-reconnecting')).toBeNull();
  });

  it('says it is reconnecting while a voice subscription is rate-limited', () => {
    useVoiceStore.setState({ isSignalingDegraded: true });
    renderBar();
    expect(screen.getByTestId('voice-bar-reconnecting').textContent).toBe('Reconnecting to voice…');
    expect(screen.queryByText('Voice connected')).toBeNull();
  });
});
