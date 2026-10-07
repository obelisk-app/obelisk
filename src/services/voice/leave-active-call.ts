/**
 * Leave the call from outside the room (the sidebar status bar), with the
 * same effect as the room's own Leave: tear the client down, clear the
 * active-client ref and reset the voice store. Without the last two the
 * bar would stay up in a half-disconnected state.
 */
import { getActiveVoiceClient, setActiveVoiceClient } from '@/services/voice/active-client';
import { useVoiceStore } from '@/store/voice';

export async function leaveActiveVoiceCall(): Promise<void> {
  const client = getActiveVoiceClient();
  if (client) {
    // The client releases its media before anything that can throw, so
    // the person is off the air; drop the call locally and say what failed.
    try { await client.leave(); }
    catch (err) { console.warn('[voice] leave failed; the call was dropped locally anyway', err); }
  }
  setActiveVoiceClient(null);
  useVoiceStore.getState().leaveVoice();
}
