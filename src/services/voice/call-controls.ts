/**
 * The call's toggles, as the sidebar status bar and the room's control bar
 * both run them: each acts on the active VoiceClient (and does nothing
 * without one) and puts a failure the person should read in the voice
 * store as an error code. A camera or screen prompt the person declined
 * (`NotAllowedError`) is their answer, not an error.
 */
import { getActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient } from '@/services/voice/client';
import { voiceErrorCode, type VoiceErrorCode } from '@/utils/voice/errors';
import { useVoiceStore } from '@/store/voice';

function isDeclinedPrompt(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'NotAllowedError';
}

async function runMediaToggle(action: (client: VoiceClient) => Promise<void>, fallback: VoiceErrorCode): Promise<void> {
  const client = getActiveVoiceClient();
  if (!client) return;
  try {
    await action(client);
  } catch (err) {
    if (!isDeclinedPrompt(err)) useVoiceStore.getState().setError(voiceErrorCode(err, fallback));
  }
}

/** Turn the mic on when `isMuted`, off otherwise. Any failure is shown, a denied mic included. */
export async function toggleVoiceMic(isMuted: boolean): Promise<void> {
  const client = getActiveVoiceClient();
  if (!client) return;
  try {
    await client.setMicEnabled(isMuted);
  } catch (err) {
    useVoiceStore.getState().setError(voiceErrorCode(err, 'mic'));
  }
}

/**
 * Flip deafen on the client and in the store, at once; deafening with the
 * mic open also stops the mic. Resolves when that mic stop does, and
 * rejects with its failure, so the caller decides how to report it.
 */
export async function toggleVoiceDeafen(isDeafened: boolean, isMuted: boolean): Promise<void> {
  const client = getActiveVoiceClient();
  if (!client) return;
  const next = !isDeafened;
  client.setDeafenEnabled(next);
  useVoiceStore.getState().setDeafened(next);
  if (next && !isMuted) await client.setMicEnabled(false);
}

/**
 * `toggleVoiceDeafen` as both control bars run it. Deafen is already
 * applied when the mic stop fails; a mic that will not stop is the one
 * thing worth hearing about, since it stays live, so it is warned about and
 * never left as an unhandled rejection.
 */
export function toggleVoiceDeafenWarned(isDeafened: boolean, isMuted: boolean): Promise<void> {
  return toggleVoiceDeafen(isDeafened, isMuted).catch((e) => console.warn('[voice] mic did not stop on deafen', e));
}

export function toggleVoiceCamera(isCameraOn: boolean): Promise<void> {
  return runMediaToggle((c) => c.setCameraEnabled(!isCameraOn), 'camera');
}

export function switchVoiceCamera(): Promise<void> {
  return runMediaToggle((c) => c.switchCamera(), 'switchCamera');
}

export function toggleVoiceScreenShare(isScreenSharing: boolean): Promise<void> {
  return runMediaToggle((c) => c.setScreenShareEnabled(!isScreenSharing), 'screen');
}
