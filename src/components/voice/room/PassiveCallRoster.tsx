'use client';

import { useTranslations } from 'next-intl';
import { usePassiveCallRoster } from '@/hooks/voice/room/usePassiveCallRoster';
import PassiveCallParticipant from './PassiveCallParticipant';

/** Who is already in the call, shown before joining: a few faces, "+N more", and the topology. */
export default function PassiveCallRoster({ pubkeys, count, mode }: {
  pubkeys: readonly string[];
  count: number;
  mode?: 'sfu' | 'mesh';
}) {
  const t = useTranslations();
  const { empty, visible, hidden } = usePassiveCallRoster(pubkeys, count);
  if (empty) return null;
  const topology = mode === 'sfu' ? 'SFU' : mode === 'mesh' ? 'Mesh' : t('voice.roster.live'); // i18n-exempt: SFU and Mesh are topology names
  return (
    <div
      className="mx-auto mb-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-left"
      data-testid="passive-call-roster"
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-lc-muted">
        <span>{t('voice.inCall')}</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-lc-white/75">{topology}</span>
      </div>
      {visible.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {visible.map((pk) => <PassiveCallParticipant key={pk} pubkey={pk} />)}
          {hidden > 0 && (
            <span className="inline-flex min-w-0 items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-lc-muted">
              {t('voice.roster.more', { count: hidden })}
            </span>
          )}
        </div>
      ) : (
        <div className="text-xs text-lc-muted">
          {count > 0 ? t('voice.roster.syncingCount', { count }) : t('voice.roster.syncing')}
        </div>
      )}
    </div>
  );
}
