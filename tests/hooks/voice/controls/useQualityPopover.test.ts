import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useQualityPopover } from '@/hooks/voice/controls/useQualityPopover';
import { useVoiceStore } from '@/store/voice';

afterEach(() => { useVoiceStore.setState({ videoQuality: 'auto', receivedVideoQuality: 'auto' }); });

describe('useQualityPopover', () => {
  it('reads both settings from the store and sets them', async () => {
    const { result } = renderHook(() => useQualityPopover());
    act(() => { result.current.setVideoQuality('480p'); });
    act(() => { result.current.setReceivedQuality('1080p'); });
    expect(result.current.videoQuality).toBe('480p');
    expect(result.current.receivedVideoQuality).toBe('1080p');
  });
});
