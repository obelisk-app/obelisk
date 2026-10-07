'use client';

/**
 * Everything a DM call puts on screen, mounted once per shell:
 *
 * - the incoming-call banner (ringing is done by the store, through the
 *   notification stack - `ringIncomingCall`);
 * - the call view, from "Calling…" through the "Call ended" card;
 * - one hidden `<audio>` for the other side's voice, mounted here rather
 *   than in the view so minimising or re-rendering the view never cuts it.
 */

import { useStreamRef } from '@/hooks/call/useStreamRef';
import { useDmCallStore } from '@/store/call/dm-call';
import IncomingCallBanner from './IncomingCallBanner';
import DmCallView from './DmCallView';

/** Listening for calls is not done here: see `useDmCallListener`, mounted by `LazyDmCallLayer`. */
export function DmCallLayer() {
  const status = useDmCallStore((s) => s.status);
  const remoteAudio = useDmCallStore((s) => s.media.remoteAudio);
  const audioRef = useStreamRef<HTMLAudioElement>(remoteAudio);

  return (
    <>
      <audio ref={audioRef} autoPlay className="hidden" data-testid="dm-call-audio" />
      {status === 'incoming' && <IncomingCallBanner />}
      {status !== 'idle' && status !== 'incoming' && <DmCallView />}
    </>
  );
}
