import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import { clearVoiceDebug, pushVoiceDebug, setVoiceMetricsRef } from '@/services/voice/debug';
import { emptyVoiceMetrics } from '@/services/voice/metrics';
import { DebugOverlay } from '@/components/voice/room/DebugOverlay';

const renderLocalized = () => render(<LocaleProvider initialLocale="en"><DebugOverlay /></LocaleProvider>);
const bag = () => (window as unknown as { __obeliskVoiceDebug?: { metrics: unknown } }).__obeliskVoiceDebug;

beforeEach(() => {
  vi.useFakeTimers();
  clearVoiceDebug();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (bag()) bag()!.metrics = null;
});

describe('DebugOverlay', () => {
  it('says no client is mounted when there are no metrics', () => {
    renderLocalized();
    expect(screen.getByTestId('voice-debug-overlay')).toHaveTextContent('no VoiceClient mounted');
  });

  it('renders the live counters and highlights the ones that should stay at zero', async () => {
    const metrics = emptyVoiceMetrics();
    metrics.peers.connected = 2;
    metrics.signalsDropped.wot = 1;
    metrics.relay.lastError = 'rate-limited: slow down';
    setVoiceMetricsRef(metrics);
    pushVoiceDebug({ kind: 'relay-error', payload: 'rate-limited' });
    pushVoiceDebug({ kind: 'pc-state', peer: 'b'.repeat(64), payload: 'connected' });
    renderLocalized();
    const overlay = screen.getByTestId('voice-debug-overlay');
    expect(overlay).toHaveTextContent('connected2');
    expect(overlay).toHaveTextContent('wot1');
    expect(overlay).toHaveTextContent('rate-limited: slow down');
    expect(overlay).toHaveTextContent('relay-error');
    expect(overlay).toHaveTextContent('bbbbbbbb');
    // Mutated in place: the next tick shows the new value without a new ref.
    metrics.peers.connected = 3;
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(screen.getByTestId('voice-debug-overlay')).toHaveTextContent('connected3');
  });
});
