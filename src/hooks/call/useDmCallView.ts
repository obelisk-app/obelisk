'use client';

import { useRef } from 'react';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { useCallFullscreen } from '@/hooks/call/useCallFullscreen';
import { useStreamRef } from '@/hooks/call/useStreamRef';
import { displayNameFor } from '@/utils/identity/display-name';
import { useDmCallStore } from '@/store/call/dm-call';
import { callStatusKey, canShareScreen } from '@/utils/call/call-status';

/**
 * The DM call view's view model: the call store, the peer's name and
 * picture, the video elements bound to their streams, fullscreen, and what
 * the status line says (docs/conventions.md#component-files).
 */
export function useDmCallView() {
  const s = useDmCallStore();
  const viewRef = useRef<HTMLDivElement>(null);
  const { full, toggle: toggleFullscreen } = useCallFullscreen(viewRef);
  const author = useAuthor(s.peer);
  const remoteVideoRef = useStreamRef<HTMLVideoElement>(s.media.remoteScreen ?? s.media.remoteVideo);
  const localVideoRef = useStreamRef<HTMLVideoElement>(s.media.localVideo);
  return {
    s,
    viewRef,
    full,
    toggleFullscreen,
    remoteVideoRef,
    localVideoRef,
    picture: author.picture,
    name: s.peer ? displayNameFor(s.peer, author) : '',
    showRemoteVideo: Boolean(s.media.remoteScreen ?? s.media.remoteVideo),
    lineKey: callStatusKey(s.status),
    endedKey: `calls.call.ended.${s.endReason ?? 'local-hangup'}` as const,
    ended: s.status === 'ended',
    canShare: canShareScreen(),
  };
}

export type DmCallViewModel = ReturnType<typeof useDmCallView>;
