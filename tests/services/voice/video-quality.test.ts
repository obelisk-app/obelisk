import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient } from '@/services/voice/client';
import { setVoiceReceivedQuality, setVoiceVideoQuality } from '@/services/voice/video-quality';
import { useVoiceStore } from '@/store/voice';

const client = {
  applyVideoQuality: vi.fn(async () => {}),
  broadcastReceivedQuality: vi.fn(async () => {}),
};

beforeEach(() => {
  useVoiceStore.setState({ error: null, videoQuality: '720p', receivedVideoQuality: '720p' });
});
afterEach(() => {
  setActiveVoiceClient(null);
  vi.clearAllMocks();
});

describe('video quality settings', () => {
  it('set the store even without a call', async () => {
    await setVoiceVideoQuality('480p');
    await setVoiceReceivedQuality('1080p');
    expect(useVoiceStore.getState()).toMatchObject({ videoQuality: '480p', receivedVideoQuality: '1080p' });
  });

  it('tell the active client', async () => {
    setActiveVoiceClient(client as unknown as VoiceClient);
    await setVoiceVideoQuality('480p');
    await setVoiceReceivedQuality('1080p');
    expect(client.applyVideoQuality).toHaveBeenCalledWith('480p');
    expect(client.broadcastReceivedQuality).toHaveBeenCalledWith('1080p');
  });

  it('show a client failure as the quality error, keeping the new setting', async () => {
    client.applyVideoQuality.mockRejectedValueOnce(new Error('no'));
    setActiveVoiceClient(client as unknown as VoiceClient);
    await setVoiceVideoQuality('480p');
    expect(useVoiceStore.getState().error).toBe('quality');
    expect(useVoiceStore.getState().videoQuality).toBe('480p');
  });
});
