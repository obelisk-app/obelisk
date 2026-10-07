'use client';

import { useActiveCall, type JsGroup } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import PulseDot from '@/components/ui/animations/PulseDot';

/**
 * "LIVE" pill rendered next to a voice channel's name when the SFU has
 * published a current kind 31314 active-call announcement for it. Only
 * shown for voice / voice-sfu channels - text and forum channels can't
 * have an SFU room. Re-evaluates every 15s via {@link useActiveCall} so
 * a stale (expired) announcement fades without needing a manual refresh.
 */
export function ActiveCallBadge({ groupId, kind }: { groupId: string; kind: JsGroup['kind'] }) {
  const t = useTranslations();
  const active = useActiveCall(groupId);
  if (kind !== 'voice' && kind !== 'voice-sfu') return null;
  if (!active) return null;
  return (
    <span
      title={t('shell.desktop.voice.liveTitle')}
      className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-300"
    >
      <PulseDot color="bg-red-400" size="xs" />
      {t('shell.desktop.voice.live')}
    </span>
  );
}
