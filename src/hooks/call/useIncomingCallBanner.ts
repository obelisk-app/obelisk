'use client';

import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { displayNameFor } from '@/utils/identity/display-name';
import { useDmCallStore } from '@/store/call/dm-call';

/**
 * The incoming-call banner's view model: who is calling, whether they
 * asked for video, and the answers (docs/ui/conventions.md#component-files).
 */
export function useIncomingCallBanner() {
  const peer = useDmCallStore((s) => s.peer);
  const video = useDmCallStore((s) => s.video);
  const author = useAuthor(peer);
  return {
    peer,
    video,
    picture: author.picture,
    name: peer ? displayNameFor(peer, author) : '',
    decline: () => useDmCallStore.getState().declineCall(),
    acceptVoice: () => void useDmCallStore.getState().acceptCall(false),
    acceptVideo: () => void useDmCallStore.getState().acceptCall(true),
  };
}
