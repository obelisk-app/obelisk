import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveVoiceClient, setActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient } from '@/services/voice/client';
import { leaveActiveVoiceCall } from '@/services/voice/leave-active-call';
import { useVoiceStore } from '@/store/voice';

beforeEach(() => {
  useVoiceStore.setState({ currentVoiceChannelId: 'ch1', currentVoiceRelayUrl: 'wss://home.relay' });
});
afterEach(() => {
  setActiveVoiceClient(null);
  vi.restoreAllMocks();
});

describe('leaveActiveVoiceCall', () => {
  it('leaves the client, clears it and resets the voice store', async () => {
    const leave = vi.fn(async () => {});
    setActiveVoiceClient({ leave } as unknown as VoiceClient);
    await leaveActiveVoiceCall();
    expect(leave).toHaveBeenCalledTimes(1);
    expect(getActiveVoiceClient()).toBeNull();
    expect(useVoiceStore.getState().currentVoiceChannelId).toBeNull();
  });

  it('drops the call locally and says so when leave() rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setActiveVoiceClient({ leave: vi.fn(async () => { throw new Error('relay hung'); }) } as unknown as VoiceClient);
    await leaveActiveVoiceCall();
    expect(warn).toHaveBeenCalledWith('[voice] leave failed; the call was dropped locally anyway', expect.any(Error));
    expect(getActiveVoiceClient()).toBeNull();
    expect(useVoiceStore.getState().currentVoiceChannelId).toBeNull();
  });

  it('resets the store with no client at all', async () => {
    await leaveActiveVoiceCall();
    expect(useVoiceStore.getState().currentVoiceChannelId).toBeNull();
  });
});
