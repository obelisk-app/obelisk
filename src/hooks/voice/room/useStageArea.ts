import type { Dispatch, SetStateAction } from 'react';
import type { ActiveStage, TracksByPubkey } from '@/utils/voice/stage-layout';
import { audioGridClass, cameraStreamFor, togglePinned, videoGridClass } from '@/utils/voice/stage-grid';

/** What the room hands its stage area: the layout `useVoiceRoom` worked out, and the pin. */
export interface StageAreaInput {
  activeStage: ActiveStage | null;
  pinned: string | null;
  setPinned: Dispatch<SetStateAction<string | null>>;
  videoPubkeys: string[];
  audioPubkeys: string[];
  selfPubkey: string;
  localCamStream: MediaStream | null;
  tracksByPubkey: TracksByPubkey;
}

/**
 * The stage area's view model: the layout it was given, plus each tile's
 * stream, who is me, the grids' columns and the pin handlers
 * (docs/conventions.md#component-files).
 */
export function useStageArea(input: StageAreaInput) {
  const { setPinned, selfPubkey, localCamStream, tracksByPubkey, videoPubkeys, audioPubkeys } = input;
  return {
    ...input,
    isSelf: (pubkey: string) => pubkey === selfPubkey,
    streamFor: (pubkey: string) => cameraStreamFor(pubkey, selfPubkey, localCamStream, tracksByPubkey),
    pin: (pubkey: string) => setPinned(pubkey),
    togglePin: (pubkey: string) => setPinned((p) => togglePinned(p, pubkey)),
    videoGridClass: videoGridClass(videoPubkeys.length),
    audioGridClass: audioGridClass(audioPubkeys.length),
    /** Audio-only people fill the area when nobody has a camera on, else they are chips under the cameras. */
    audioAsGrid: audioPubkeys.length > 0 && videoPubkeys.length === 0,
    audioAsChips: audioPubkeys.length > 0 && videoPubkeys.length > 0,
  };
}

export type StageAreaModel = ReturnType<typeof useStageArea>;
