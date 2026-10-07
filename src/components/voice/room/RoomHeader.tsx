'use client';

/**
 * The room header and its topology pill: the SFU upgrade status for a
 * `voice-sfu` channel, or the media-sync badge for a mesh call while peer
 * connections are still coming up. Pure presentation.
 */
import { useTranslations } from 'next-intl';
import type { SfuStatus } from '@/services/voice/room-events';
import SfuStatusPill from './SfuStatusPill';
import MeshSyncStatusPill from './MeshSyncStatusPill';

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
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lc-green opacity-50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-lc-green" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-lc-muted leading-none mb-1">{t('voice.channel')}</div>
          <div className="font-semibold text-lc-white truncate text-sm sm:text-base leading-tight">{name}</div>
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
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span className="tabular-nums">{count}</span>
      </div>
    </div>
  );
}
