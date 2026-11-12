'use client';
import { useVideoCarousel } from '@/hooks/marketing/useVideoCarousel';
import { useTranslations } from 'next-intl';
import { ChevronLeftIcon, ChevronRightIcon } from '@/assets/icons';
import Text from '@/components/ui/layout/Text';
import Button from '@/components/ui/buttons/Button';
import YouTubeEmbed from '@/components/common/YouTubeEmbed';
import { LANDING_VIDEOS } from '@/constants/marketing/videos';

export default function VideoCarousel() {
  const t = useTranslations();
  const { index, videoRef, previous, next, onTouchStart, onTouchEnd } = useVideoCarousel();
  return <div>
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {LANDING_VIDEOS[index].kind === 'youtube' ?
        <YouTubeEmbed key={LANDING_VIDEOS[index].id} videoId={LANDING_VIDEOS[index].id} title={t(LANDING_VIDEOS[index].title)} thumbnailRes="maxres" className="w-full shadow-2xl shadow-black/40" /> :
        <video ref={videoRef} key={LANDING_VIDEOS[index].id} src={LANDING_VIDEOS[index].id} controls playsInline preload="none" aria-label={t(LANDING_VIDEOS[index].title)} className={`w-full rounded-lg border border-lc-border bg-black object-contain ${LANDING_VIDEOS[index].id.includes('relay-switcher') ? 'aspect-[9/16] max-h-[70dvh] sm:aspect-video' : 'aspect-video'}`} />}
    </div>
    <div className="mt-4 flex items-center justify-between gap-4">
      <Button variant="secondary" aria-label={t('common.previous')} disabled={index === 0} onClick={previous}><ChevronLeftIcon size={20} /></Button>
      <Text as="p" aria-live="polite" className="text-center text-lc-muted">{t(LANDING_VIDEOS[index].title)} · {index + 1}/{LANDING_VIDEOS.length}</Text>
      <Button variant="secondary" aria-label={t('common.next')} disabled={index === LANDING_VIDEOS.length - 1} onClick={next}><ChevronRightIcon size={20} /></Button>
    </div>
  </div>;
}
