import { useEffect, useState } from 'react';
import { useBridge, useUserMetadata, type JsUserMetadata } from '@/services/nostr-bridge';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { participantName } from '@/utils/voice/participant-name';

/** A participant's picture and the name their tile shows. */
export function useParticipantProfile(pubkey: string, cachedOnly = false) {
  const live = useUserMetadata(cachedOnly ? null : pubkey);
  const bridge = useBridge();
  const [cached, setCached] = useState<{ pubkey: string; meta: JsUserMetadata | null } | null>(null);
  useEffect(() => {
    if (!cachedOnly || !bridge) return;
    return bridge.userMetadata.subscribe((profiles) => setCached({ pubkey, meta: profiles[pubkey] ?? null }));
  }, [cachedOnly, bridge, pubkey]);
  const meta = cachedOnly ? (cached?.pubkey === pubkey ? cached.meta : null) : live;
  if (cachedOnly) return { picture: meta?.picture, name: meta?.displayName || meta?.name || shortNpubLabel(pubkey) };
  return { picture: meta?.picture, name: participantName(meta, pubkey) };
}
