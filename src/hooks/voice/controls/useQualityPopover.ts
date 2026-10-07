import { useVoiceStore } from '@/store/voice';
import type { VideoQuality } from '@/services/voice/quality';
import { setVoiceReceivedQuality, setVoiceVideoQuality } from '@/services/voice/video-quality';

/**
 * The quality popover's view model: the two settings from the voice store
 * and their setters (docs/conventions.md#component-files).
 */
export function useQualityPopover() {
  const videoQuality = useVoiceStore((s) => s.videoQuality);
  const receivedVideoQuality = useVoiceStore((s) => s.receivedVideoQuality);
  return {
    videoQuality,
    receivedVideoQuality,
    setVideoQuality: (q: VideoQuality) => void setVoiceVideoQuality(q),
    setReceivedQuality: (q: VideoQuality) => void setVoiceReceivedQuality(q),
  };
}
