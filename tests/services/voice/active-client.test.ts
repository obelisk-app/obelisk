import { afterEach, describe, expect, it, vi } from 'vitest';
import { setActiveVoiceClient, subscribeActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient } from '@/services/voice/client';

afterEach(() => {
  setActiveVoiceClient(null);
  vi.restoreAllMocks();
});

describe('subscribeActiveVoiceClient', () => {
  it('replays the current client and fires on every change', () => {
    const cb = vi.fn();
    const unsub = subscribeActiveVoiceClient(cb);
    expect(cb).toHaveBeenCalledWith(null);
    const fake = { channelId: 'ch1' } as unknown as VoiceClient;
    setActiveVoiceClient(fake);
    expect(cb).toHaveBeenLastCalledWith(fake);
    unsub();
    setActiveVoiceClient(null);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('reports a listener that throws instead of silently dropping it, and still notifies the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const healthy = vi.fn();
    subscribeActiveVoiceClient(() => { throw new Error('sink exploded'); });
    subscribeActiveVoiceClient(healthy);
    expect(warn).toHaveBeenCalledWith('[voice] active-client listener threw on subscribe', expect.any(Error));
    const fake = { channelId: 'ch1' } as unknown as VoiceClient;
    setActiveVoiceClient(fake);
    expect(warn).toHaveBeenCalledWith('[voice] active-client listener threw', expect.any(Error));
    expect(healthy).toHaveBeenLastCalledWith(fake);
  });
});
