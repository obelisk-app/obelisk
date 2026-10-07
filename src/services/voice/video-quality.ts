/**
 * The quality popover's two settings. The voice store is the source of
 * truth and is set first; the active client, if any, is told afterwards,
 * and a failure there is shown as the `quality` error.
 */
import { getActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient } from '@/services/voice/client';
import { voiceErrorCode } from '@/services/voice/errors';
import type { VideoQuality } from '@/services/voice/quality';
import { useVoiceStore } from '@/store/voice';

async function tellClient(apply: (client: VoiceClient) => Promise<void>): Promise<void> {
  const client = getActiveVoiceClient();
  if (!client) return;
  try {
    await apply(client);
  } catch (e) {
    useVoiceStore.getState().setError(voiceErrorCode(e, 'quality'));
  }
}

/** The cap on the camera this person sends. */
export function setVoiceVideoQuality(q: VideoQuality): Promise<void> {
  useVoiceStore.getState().setVideoQuality(q);
  return tellClient((c) => c.applyVideoQuality(q));
}

/** The quality this person asks the others to send. */
export function setVoiceReceivedQuality(q: VideoQuality): Promise<void> {
  useVoiceStore.getState().setReceivedVideoQuality(q);
  return tellClient((c) => c.broadcastReceivedQuality(q));
}
