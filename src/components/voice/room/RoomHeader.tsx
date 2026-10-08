'use client';

import Text from '@/components/ui/layout/Text';

/**
 * The room header and its topology pill: the SFU upgrade status for a
 * `voice-sfu` channel, or the media-sync badge for a mesh call while peer
 * connections are still coming up. Pure presentation.
 */
import { useTranslations } from 'next-intl';
import type { SfuStatus } from '@/services/voice/room-events';
import SfuStatusPill from './SfuStatusPill';
import MeshSyncStatusPill from './MeshSyncStatusPill';
import { UsersIcon } from '@/assets/icons';
import PingDot from '@/components/ui/animations/PingDot';

export default function RoomHeader({ name, count, sfuStatus, meshSyncingCount = 0 }: {
  name: string;
  count: number;
  sfuStatus?: SfuStatus;
  meshSyncingCount?: number;
}) {
  const t = useTranslations();
  return (
    <div className="relative z-10 px-3 sm:px-5 py-3 flex items-center gap-3 border-b border-white/5" data-testid="voice-room-header">
      <div className="min-w-0 flex items-center gap-2.5 flex-1 min-w-0">
        <PingDot color="bg-lc-green" size="sm" halo={50} className="shrink-0" />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-lc-muted leading-none mb-1">{t('voice.channel')}</div>
          <Text as="div" size="sm" weight="semibold" tone="default" truncate="truncate" className="sm:text-base leading-tight">{name}</Text>
        </div>
      </div>
      {/* Compact topology status. SFU channels get the SFU badge; mesh
          channels show a live media-sync badge while peer PCs connect. */}
      <div className="flex justify-center shrink-0">
        {(sfuStatus ?? 'na') !== 'na' ? (
          <SfuStatusPill status={sfuStatus ?? 'na'} />
        ) : (
          <MeshSyncStatusPill count={meshSyncingCount} />
        )}
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/80 shrink-0">
        <UsersIcon size={12} strokeWidth={2.5} />
        <span className="tabular-nums">{count}</span>
      </div>
    </div>
  );
}
