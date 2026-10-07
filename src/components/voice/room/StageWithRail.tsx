'use client';

import type { StageAreaModel } from '@/hooks/voice/room/useStageArea';
import type { ActiveStage } from '@/utils/voice/stage-layout';
import Stage from './Stage';
import ScrollableRail from './ScrollableRail';
import RailVideoTile from './RailVideoTile';
import RailAudioTile from './RailAudioTile';

/** A pinned or presenting stage, with everyone (click to pin) in the side rail, a bottom strip on a phone. */
export default function StageWithRail({ vm, stage }: { vm: StageAreaModel; stage: ActiveStage }) {
  return (
    <>
      {/* Main stage */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <Stage
          pubkey={stage.pubkey}
          isLocal={stage.isLocal}
          kind={stage.kind}
          videoStream={stage.videoStream}
          pinned={vm.pinned === stage.pubkey}
          onTogglePin={() => vm.togglePin(stage.pubkey)}
        />
      </div>

      {/* Side rail (desktop) / bottom strip (mobile) - everyone, click to pin */}
      <ScrollableRail>
        {vm.videoPubkeys.map((pk) => (
          <RailVideoTile
            key={pk}
            pubkey={pk}
            isLocal={vm.isSelf(pk)}
            videoStream={vm.streamFor(pk)}
            isPinned={vm.pinned === pk}
            isStage={stage.pubkey === pk}
            onClick={() => vm.togglePin(pk)}
          />
        ))}
        {vm.audioPubkeys.map((pk) => (
          <RailAudioTile
            key={pk}
            pubkey={pk}
            isLocal={vm.isSelf(pk)}
          />
        ))}
      </ScrollableRail>
    </>
  );
}
