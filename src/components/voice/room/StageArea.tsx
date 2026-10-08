'use client';

/**
 * How the joined room lays its participants out: a pinned or presenting
 * stage with a rail of everyone else, or, without one, a video grid over
 * an audio strip. The rules deciding who is where are `stage-layout.ts`
 * and `stage-grid.ts`; this is their rendering.
 */
import Stack from '@/components/ui/layout/Stack';
import { useStageArea, type StageAreaInput } from '@/hooks/voice/room/useStageArea';
import StageWithRail from './StageWithRail';
import ParticipantGrid from './ParticipantGrid';

export function StageArea(props: StageAreaInput) {
  const vm = useStageArea(props);
  return (
    <Stack gap="2" className="relative z-10 flex-1 min-h-0 md:flex-row sm:gap-3 p-2 sm:p-3 pb-24 sm:pb-28 overflow-hidden">
      {vm.activeStage ? <StageWithRail vm={vm} stage={vm.activeStage} /> : <ParticipantGrid vm={vm} />}
    </Stack>
  );
}
