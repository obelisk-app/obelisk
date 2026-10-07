'use client';

import type { StageAreaModel } from '@/hooks/voice/room/useStageArea';
import VideoTile from './VideoTile';
import AudioTile from './AudioTile';
import AudioChip from './AudioChip';

/** No stage: the cameras in a grid over a strip of audio chips, or the audio-only people in a grid of their own. */
export default function ParticipantGrid({ vm }: { vm: StageAreaModel }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
      {vm.videoPubkeys.length > 0 && (
        <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center" data-testid="video-grid">
          {vm.videoPubkeys.length === 1 ? (
            <div className="max-w-full max-h-full aspect-video w-auto h-full">
              <VideoTile
                pubkey={vm.videoPubkeys[0]}
                isLocal={vm.isSelf(vm.videoPubkeys[0])}
                videoStream={vm.streamFor(vm.videoPubkeys[0])}
                onPin={() => vm.pin(vm.videoPubkeys[0])}
                fit="contain"
                fillParent
              />
            </div>
          ) : (
            <div
              className={'grid gap-2 sm:gap-3 w-full h-full auto-rows-fr min-h-0 ' + vm.videoGridClass}
            >
              {vm.videoPubkeys.map((pk) => (
                <VideoTile
                  key={pk}
                  pubkey={pk}
                  isLocal={vm.isSelf(pk)}
                  videoStream={vm.streamFor(pk)}
                  onPin={() => vm.pin(pk)}
                  fit="cover"
                  fillParent
                />
              ))}
            </div>
          )}
        </div>
      )}

      {vm.audioAsGrid && (
        <div className="flex-1 min-h-0 flex items-center justify-center" data-testid="audio-participants">
          <div
            className={'grid gap-3 sm:gap-4 ' + vm.audioGridClass}
          >
            {vm.audioPubkeys.map((pk) => (
              <AudioTile
                key={pk}
                pubkey={pk}
                isLocal={vm.isSelf(pk)}
              />
            ))}
          </div>
        </div>
      )}

      {vm.audioAsChips && (
        <div className="shrink-0 flex gap-2 overflow-x-auto pb-1" data-testid="audio-participants">
          {vm.audioPubkeys.map((pk) => (
            <AudioChip
              key={pk}
              pubkey={pk}
              isLocal={vm.isSelf(pk)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
