import { useEffect, useState } from 'react';
import { subscribeActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient, RemoteTrack } from '@/services/voice/client';
import { audibleTracks } from '@/utils/voice/audible-tracks';

/**
 * The background audio sink's view model: the active call's audible remote
 * tracks, following the active client as calls start and end
 * (docs/conventions.md#component-files).
 */
export function useBackgroundVoiceAudio(): RemoteTrack[] {
  const [client, setClient] = useState<VoiceClient | null>(null);
  const [tracks, setTracks] = useState<RemoteTrack[]>([]);

  useEffect(() => {
    return subscribeActiveVoiceClient((c) => {
      setClient(c);
      if (!c) setTracks([]);
    });
  }, []);

  useEffect(() => {
    if (!client) return;
    return client.subscribeRemoteTracks((t) => setTracks(t));
  }, [client]);

  return audibleTracks(tracks);
}
