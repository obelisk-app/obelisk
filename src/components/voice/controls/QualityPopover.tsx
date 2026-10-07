'use client';

/**
 * The gear popover of the in-room control pill: the outbound camera
 * quality cap and the incoming-quality hint, one segmented selector each.
 * The store is the source of truth; the active client is told afterwards.
 */
import { useTranslations } from 'next-intl';
import { useQualityPopover } from '@/hooks/voice/controls/useQualityPopover';
import QualitySection from './QualitySection';

export default function QualityPopover() {
  const t = useTranslations();
  const vm = useQualityPopover();

  return (
    <div
      className="absolute bottom-full mb-3 right-0 w-64 max-w-[calc(100vw-1rem)] rounded-2xl bg-black/90 backdrop-blur-xl border border-white/10 shadow-2xl p-3 text-white/90"
      data-testid="quality-popover"
    >
      <QualitySection
        label={t('voice.myCamera')}
        value={vm.videoQuality}
        onChange={vm.setVideoQuality}
        testid="quality-out"
      />
      <div className="h-px bg-white/10 my-3" />
      <QualitySection
        label={t('voice.incoming')}
        value={vm.receivedVideoQuality}
        onChange={vm.setReceivedQuality}
        testid="quality-in"
      />
      <p className="text-[10px] text-white/40 mt-2">{t('voice.audioNote')}</p>
    </div>
  );
}
