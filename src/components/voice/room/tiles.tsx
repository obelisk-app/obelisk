'use client';

/**
 * Participant tiles: the pinned stage, camera tiles (grid and rail), audio
 * tiles (grid, rail and chip), the avatar they share, the per-peer quality
 * dot and the speaking ring. Every tile reads speaking / quality / mute
 * state from the voice store, never from the client.
 */
import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import { useUserMetadata as useProfile } from '@/services/nostr-bridge';
import { useAutoplayVideo } from '@/hooks/useAutoplayVideo';
import { useTileSpeaking } from '@/hooks/useTileSpeaking';
import { useVoiceStore } from '@/store/voice';
import { qualityColor, type QualitySample } from '@/services/voice/stats';
import RemoteImage from '@/components/ui/RemoteImage';
import { MuteForMeButton, FullscreenButton } from './controls';

export function Stage({ pubkey, isLocal, kind, videoStream, pinned, onTogglePin }: {
  pubkey: string;
  isLocal: boolean;
  kind: 'screen' | 'camera';
  videoStream: MediaStream | null;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const t = useTranslations();
  const meta = useProfile(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const speaking = useTileSpeaking(pubkey);
  useAutoplayVideo(videoRef, videoStream);
  const label =
    kind === 'screen'
      ? isLocal ? t('voice.tile.youPresenting') : t('voice.tile.presenting', { name })
      : isLocal ? t('voice.tile.you', { name }) : name;
  return (
    <div
      ref={containerRef}
      className={
        'relative flex-1 min-h-0 rounded-xl overflow-hidden bg-black ring-1 ring-white/10 transition-shadow ' +
        (speaking ? 'ring-2 ring-lc-green shadow-[0_0_24px_rgba(180,249,83,0.4)]' : '')
      }
      data-testid={kind === 'screen' ? 'screen-share-area' : 'video-stage'}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={'w-full h-full object-contain ' + (kind === 'camera' && isLocal ? 'scale-x-[-1]' : '')}
      />
      <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/60 backdrop-blur text-[11px] text-lc-green border border-lc-green/30">
        <span className="font-medium">{label}</span>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {!isLocal && <MuteForMeButton pubkey={pubkey} />}
        <FullscreenButton targetRef={containerRef} />
        <button
          type="button"
          onClick={onTogglePin}
          title={t(pinned ? 'voice.tile.unpin' : 'voice.tile.pinToStage')}
          className={
            'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] backdrop-blur transition-colors ' +
            (pinned
              ? 'bg-lc-green/20 text-lc-green border border-lc-green/40'
              : 'bg-black/60 text-white/80 border border-white/15 hover:bg-black/80')
          }
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5" />
            <path d="M9 10.76V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4.76a2 2 0 0 0 .55 1.39l1.65 1.7A1 1 0 0 1 16.5 15.5h-9A1 1 0 0 1 6.8 13.85l1.65-1.7A2 2 0 0 0 9 10.76z" />
          </svg>
          {t(pinned ? 'voice.tile.pinned' : 'voice.tile.pin')}
        </button>
      </div>
    </div>
  );
}

export function VideoTile({ pubkey, isLocal, videoStream, onPin, fit = 'cover', fillParent = false }: {
  pubkey: string;
  isLocal: boolean;
  videoStream: MediaStream | null;
  onPin?: () => void;
  fit?: 'cover' | 'contain';
  fillParent?: boolean;
}) {
  const t = useTranslations();
  const meta = useProfile(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const speaking = useTileSpeaking(pubkey);

  useAutoplayVideo(videoRef, videoStream);

  const fitClass = fit === 'contain' ? 'object-contain bg-black' : 'object-cover';
  // Use a div with role=button so we can host nested controls (mute,
  // fullscreen) - nested <button>s are invalid HTML.
  return (
    <div
      ref={containerRef}
      role={onPin ? 'button' : undefined}
      tabIndex={onPin ? 0 : undefined}
      onClick={onPin}
      onKeyDown={(e) => {
        if (!onPin) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPin(); }
      }}
      className={
        'relative rounded-xl overflow-hidden ring-1 ring-white/10 bg-neutral-950 group text-left transition ' +
        (onPin ? 'cursor-pointer hover:ring-lc-green/40 ' : '') +
        (speaking ? 'ring-2 ring-lc-green ' : '') +
        (fillParent ? 'w-full h-full' : 'w-full aspect-video')
      }
      data-testid="video-tile"
      title={onPin ? t('voice.tile.pinToStage') : undefined}
    >
      {videoStream ? (
        <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full ${fitClass} ${isLocal ? 'scale-x-[-1]' : ''}`} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Avatar pubkey={pubkey} picture={meta?.picture} name={name} size={20} speaking={speaking} />
        </div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {!isLocal && <MuteForMeButton pubkey={pubkey} />}
        {videoStream && <FullscreenButton targetRef={containerRef} />}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-1.5 flex items-center gap-1.5">
        {!isLocal && <QualityDot pubkey={pubkey} />}
        <span className="text-xs text-white font-medium truncate">{isLocal ? t('voice.tile.you', { name }) : name}</span>
      </div>
    </div>
  );
}

export function QualityDot({ pubkey }: { pubkey: string }) {
  const t = useTranslations();
  const { formatNumber } = useFormat();
  const sample = useVoiceStore((s) => s.peerQuality[pubkey]) as QualitySample | undefined;
  const level = sample?.level ?? 'unknown';
  const color = qualityColor(level);
  const tooltip = sample
    ? [
        sample.outboundVideoBps != null ? t('voice.quality.sendRate', { kbps: Math.round(sample.outboundVideoBps / 1000) }) : null,
        sample.rttMs != null ? t('voice.quality.rtt', { ms: Math.round(sample.rttMs) }) : null,
        sample.loss != null ? t('voice.quality.loss', { percent: formatNumber(sample.loss * 100, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }) : null,
      ].filter(Boolean).join(' · ')
    : t('voice.quality.connecting');
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      title={t('voice.quality.tooltip', { level: t(`voice.quality.level.${level}`), detail: tooltip })}
      data-testid="peer-quality-dot"
      data-quality={sample?.level ?? 'unknown'}
    />
  );
}

export function RailVideoTile({ isPinned, isStage, onClick, ...props }: {
  pubkey: string;
  isLocal: boolean;
  videoStream: MediaStream | null;
  isPinned?: boolean;
  isStage?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={
        'shrink-0 w-40 md:w-full md:max-w-full ' +
        (isStage ? 'ring-2 ring-lc-green rounded-xl' : '') +
        (isPinned ? ' opacity-90' : '')
      }
    >
      <VideoTile {...props} onPin={onClick} />
    </div>
  );
}

export function AudioTile({ pubkey, isLocal }: {
  pubkey: string;
  isLocal: boolean;
}) {
  const t = useTranslations();
  const meta = useProfile(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const speaking = useTileSpeaking(pubkey);
  return (
    <div
      className={
        'relative aspect-video sm:aspect-square w-44 sm:w-48 rounded-2xl overflow-hidden bg-gradient-to-br from-neutral-900 to-neutral-950 flex flex-col items-center justify-center p-3 transition-shadow group ' +
        (speaking ? 'ring-2 ring-lc-green shadow-[0_0_18px_rgba(180,249,83,0.35)]' : 'ring-1 ring-white/10')
      }
      data-testid="voice-participant"
    >
      <div className={'rounded-full p-1 ' + (isLocal ? 'ring-2 ring-lc-green' : 'ring-1 ring-white/10')}>
        <Avatar pubkey={pubkey} picture={meta?.picture} name={name} size={16} speaking={speaking} />
      </div>
      <div className="mt-2 text-xs text-white font-medium truncate max-w-full flex items-center gap-1.5">
        {!isLocal && <QualityDot pubkey={pubkey} />}
        <span className="truncate">{isLocal ? t('voice.tile.you', { name }) : name}</span>
      </div>
      {!isLocal && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <MuteForMeButton pubkey={pubkey} />
        </div>
      )}
    </div>
  );
}

export function RailAudioTile({ pubkey, isLocal }: {
  pubkey: string;
  isLocal: boolean;
}) {
  const t = useTranslations();
  const meta = useProfile(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const speaking = useTileSpeaking(pubkey);
  return (
    <div
      className={
        'relative shrink-0 w-40 md:w-full aspect-video rounded-xl bg-neutral-900 flex flex-col items-center justify-center gap-1.5 p-2 group transition-shadow ' +
        (speaking ? 'ring-2 ring-lc-green' : 'ring-1 ring-white/10')
      }
      data-testid="voice-participant"
    >
      <Avatar pubkey={pubkey} picture={meta?.picture} name={name} size={10} speaking={speaking} />
      <span className="text-[11px] text-white/85 truncate max-w-full px-1">{isLocal ? t('voice.tile.you', { name }) : name}</span>
      {!isLocal && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <MuteForMeButton pubkey={pubkey} compact />
        </div>
      )}
    </div>
  );
}

export function AudioChip({ pubkey, isLocal }: {
  pubkey: string;
  isLocal: boolean;
}) {
  const t = useTranslations();
  const meta = useProfile(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const speaking = useTileSpeaking(pubkey);
  return (
    <div
      className={
        'shrink-0 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/5 transition-shadow ' +
        (speaking ? 'ring-2 ring-lc-green' : 'ring-1 ring-white/10')
      }
      data-testid="voice-participant"
    >
      <Avatar pubkey={pubkey} picture={meta?.picture} name={name} size={6} speaking={speaking} />
      <span className="text-xs text-white/85 truncate max-w-[10rem]">{isLocal ? t('voice.tile.you', { name }) : name}</span>
      {!isLocal && <MuteForMeButton pubkey={pubkey} compact />}
    </div>
  );
}

export function Avatar({ pubkey, picture, name, size, speaking = false }: { pubkey: string; picture?: string | null; name: string; size: number; speaking?: boolean }) {
  const px = `${size * 4}px`;
  const speakingClass = speaking ? ' shadow-[0_0_12px_rgba(180,249,83,0.55)]' : '';
  if (picture) {
    return <RemoteImage src={picture} alt={name} className={'rounded-full object-cover' + speakingClass} style={{ width: px, height: px }} />;
  }
  return (
    <div
      className={'rounded-full bg-gradient-to-br from-lc-olive to-neutral-800 flex items-center justify-center text-lc-green font-semibold ring-1 ring-white/10' + speakingClass}
      style={{ width: px, height: px, fontSize: `${Math.max(12, size * 1.4)}px` }}
    >
      {(name[0] ?? pubkey[0])?.toUpperCase()}
    </div>
  );
}
