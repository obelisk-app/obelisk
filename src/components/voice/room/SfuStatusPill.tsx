'use client';

import { useTranslations } from 'next-intl';
import type { SfuStatus } from '@/services/voice/room-events';
import PingDot from '@/components/ui/animations/PingDot';

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

/**
 * Compact SFU-status pill rendered between the room name and the
 * participant count inside RoomHeader. Tooltip carries the long-form
 * detail. The intent is that a user creating a Big-room voice call
 * never has to wonder whether they're actually getting SFU forwarding
 * or silently dropped to the mesh, without occupying its own row of
 * chrome. Plain voice / non-sfu channels render nothing ('na').
 */
const SFU_PILL = {
  starting: { tone: 'bg-amber-500/15 border-amber-400/40 text-amber-100', dot: 'bg-amber-300', pulse: true },
  connected: { tone: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-100', dot: 'bg-emerald-300', pulse: false },
  unavailable: { tone: 'bg-amber-500/15 border-amber-400/40 text-amber-100', dot: 'bg-amber-300', pulse: false },
  unauthorized: { tone: 'bg-rose-500/15 border-rose-400/40 text-rose-100', dot: 'bg-rose-300', pulse: false },
} as const;

export default function SfuStatusPill({ status }: { status: SfuStatus }) {
  const t = useTranslations();
  if (status === 'na') return null;
  const v = SFU_PILL[status];
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sfu-status"
      data-sfu-status={status}
      title={t(`voice.sfu.${status}.detail`)}
      className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium leading-none ${v.tone}`}
    >
      <PingDot color={v.dot} ping={v.pulse} />
      <span>{t(`voice.sfu.${status}.label`)}</span>
    </div>
  );
}
