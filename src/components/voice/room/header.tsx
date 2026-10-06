'use client';

/**
 * The room header and its topology pills: the SFU upgrade status for a
 * `voice-sfu` channel, or the media-sync badge for a mesh call while peer
 * connections are still coming up. Pure presentation.
 */
import { useTranslation } from '@/i18n/context';

/**
 * SFU upgrade status for the current call. Distinct from voice-client
 * mesh/sfu topology because it also captures the pre-connect states the
 * UI needs to display:
 *
 *   - 'na'           : channel is not voice-sfu (no banner)
 *   - 'starting'     : kind 25052 published, waiting for SFU's beacon
 *   - 'connected'    : SFU peer in roster, media routes through it
 *   - 'unavailable'  : no kind 31313 advertisement found; mesh fallback
 *   - 'unauthorized' : start published but SFU never joined within
 *                      the watchdog window; likely the publisher is
 *                      not whitelisted on the SFU's trusted-author relay
 */
export type SfuStatus = 'na' | 'starting' | 'connected' | 'unavailable' | 'unauthorized';

/**
 * Compact SFU-status pill rendered between the room name and the
 * participant count inside RoomHeader. Tooltip carries the long-form
 * detail. The intent is that a user creating a Big-room voice call
 * never has to wonder whether they're actually getting SFU forwarding
 * or silently dropped to the mesh, without occupying its own row of
 * chrome. Plain voice / non-sfu channels render nothing ('na').
 */
function SfuStatusPill({ status }: { status: SfuStatus }) {
  if (status === 'na') return null;
  const variants = {
    starting: {
      label: 'SFU connecting',
      detail: 'Asking the SFU to open this big-room call.',
      tone: 'bg-amber-500/15 border-amber-400/40 text-amber-100',
      dot: 'bg-amber-300',
      pulse: true,
    },
    connected: {
      label: 'SFU connected',
      detail: 'Big-room mode active: media is routed through the SFU.',
      tone: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100',
      dot: 'bg-emerald-300',
      pulse: false,
    },
    unavailable: {
      label: 'SFU unavailable',
      detail: 'No big-room SFU is advertising. Falling back to peer-to-peer mesh (max 4 participants).',
      tone: 'bg-amber-500/15 border-amber-400/40 text-amber-100',
      dot: 'bg-amber-300',
      pulse: false,
    },
    unauthorized: {
      label: 'SFU rejected',
      detail: 'Big-room start was rejected. Your account may not be whitelisted on the SFU’s trusted relay. Call is on peer-to-peer mesh (max 4 participants).',
      tone: 'bg-rose-500/15 border-rose-400/40 text-rose-100',
      dot: 'bg-rose-300',
      pulse: false,
    },
  } as const;
  const v = variants[status];
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sfu-status"
      data-sfu-status={status}
      title={v.detail}
      className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium leading-none ${v.tone}`}
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        {v.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-70 ${v.dot}`} />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${v.dot}`} />
      </span>
      <span>{v.label}</span>
    </div>
  );
}

export function MeshSyncStatusPill({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  const detail = count === 1
    ? 'Peer detected; WebRTC media channels are still syncing in the background.'
    : count + ' peers detected; WebRTC media channels are still syncing in the background.';
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="mesh-sync-status"
      title={detail}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium leading-none whitespace-nowrap bg-amber-500/15 border-amber-400/40 text-amber-100"
    >
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-300 opacity-70" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-300" />
      </span>
      <span className="hidden sm:inline">{t('voice.mediaSyncing')}</span>
      <span className="sm:hidden">{t('voice.syncing')}</span>
      {count > 1 && <span className="tabular-nums text-amber-50/90">{count}</span>}
    </div>
  );
}

export function RoomHeader({ name, count, sfuStatus, meshSyncingCount = 0 }: {
  name: string;
  count: number;
  sfuStatus?: SfuStatus;
  meshSyncingCount?: number;
}) {
  const { t } = useTranslation();
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
