import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import { useVoiceStore } from '@/store/voice';
import { qualityColor, type QualitySample } from '@/services/voice/stats';

/**
 * A peer's connection-quality dot: its colour, its level, and the tooltip
 * (send rate, round trip and loss, whichever were measured, or
 * "connecting" before the first sample).
 */
export function useQualityDot(pubkey: string) {
  const t = useTranslations();
  const { formatNumber } = useFormat();
  const sample = useVoiceStore((s) => s.peerQuality[pubkey]) as QualitySample | undefined;
  const level = sample?.level ?? 'unknown';
  const detail = sample
    ? [
        sample.outboundVideoBps != null ? t('voice.quality.sendRate', { kbps: Math.round(sample.outboundVideoBps / 1000) }) : null,
        sample.rttMs != null ? t('voice.quality.rtt', { ms: Math.round(sample.rttMs) }) : null,
        sample.loss != null ? t('voice.quality.loss', { percent: formatNumber(sample.loss * 100, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }) : null,
      ].filter(Boolean).join(' · ')
    : t('voice.quality.connecting');
  return {
    level,
    color: qualityColor(level),
    title: t('voice.quality.tooltip', { level: t(`voice.quality.level.${level}`), detail }),
  };
}
