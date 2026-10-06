'use client';

/**
 * Everything a DM call puts on screen, mounted once per shell:
 *
 * - wires the call store to the bridge (`initDmCalls`) while logged in;
 * - the incoming-call banner (ringing is done by the store, through the
 *   notification stack - `ringIncomingCall`);
 * - the call view, from "Calling…" through the "Call ended" card;
 * - one hidden `<audio>` for the other side's voice, mounted here rather
 *   than in the view so minimising or re-rendering the view never cuts it.
 */

import { useEffect, useRef, useState } from 'react';
import { useIsLoggedIn } from '@/services/nostr-bridge';
import { useAuthor } from '@/services/social/useAuthor';
import { displayNameFor } from '@/utils/identity/display-name';
import { useTranslation } from '@/i18n/context';
import { useCallFullscreen } from '@/hooks/useCallFullscreen';
import { useStreamRef } from '@/hooks/useStreamRef';
import { formatElapsed } from '@/utils/format/format-elapsed';
import UserAvatar from '@/components/ui/UserAvatar';
import { initDmCalls, useDmCallStore, type DmCallStatus } from '@/store/dm-call';
import {
  CloseIcon, FlipCameraIcon, LockIcon, MaximizeIcon, MicIcon, MicOffIcon, MinimizeIcon, PhoneIcon, PhoneOffIcon,
  ScreenShareIcon, ShieldIcon, VideoIcon, VideoOffIcon,
} from '@/components/ui/icons';
import IconButton from '@/components/ui/IconButton';

function CallTimer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span data-testid="dm-call-timer">{formatElapsed(now - since)}</span>;
}

function statusLine(status: DmCallStatus, t: (k: string) => string): string | null {
  if (status === 'outgoing') return t('call.calling');
  if (status === 'connecting') return t('call.connecting');
  if (status === 'reconnecting') return t('call.reconnecting');
  return null;
}

export function IncomingCallBanner() {
  const { t } = useTranslation();
  const peer = useDmCallStore((s) => s.peer);
  const video = useDmCallStore((s) => s.video);
  const author = useAuthor(peer);
  if (!peer) return null;
  const name = displayNameFor(peer, author);
  return (
    <div
      className="fixed inset-x-0 top-3 z-[90] mx-auto flex w-[min(28rem,calc(100%-2rem))] items-center gap-3 rounded-2xl border border-lc-green/40 bg-lc-dark/95 p-3 shadow-2xl backdrop-blur"
      role="alertdialog"
      aria-label={video ? t('call.incomingVideo') : t('call.incomingVoice')}
      data-testid="dm-incoming-call"
    >
      <span className="relative shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-lc-green/30" aria-hidden="true" />
        <UserAvatar pubkey={peer} picture={author.picture} name={name} size={11} className="relative" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-lc-white">{name}</div>
        <div className="flex items-center gap-1 text-xs text-lc-muted">
          <LockIcon size={11} />
          <span className="truncate">{video ? t('call.incomingVideo') : t('call.incomingVoice')}</span>
        </div>
      </div>
      <IconButton
        tone="dangerSolid"
        size="10"
        onClick={() => useDmCallStore.getState().declineCall()}
        aria-label={t('call.decline')}
        title={t('call.decline')}
        data-testid="dm-call-decline"
      >
        <PhoneOffIcon size={18} />
      </IconButton>
      <IconButton
        tone="primary"
        size="10"
        onClick={() => void useDmCallStore.getState().acceptCall(false)}
        aria-label={t('call.acceptVoice')}
        title={t('call.acceptVoice')}
        data-testid="dm-call-accept"
      >
        <PhoneIcon size={18} />
      </IconButton>
      {video && (
        <IconButton
          tone="primary"
          size="10"
          onClick={() => void useDmCallStore.getState().acceptCall(true)}
          aria-label={t('call.acceptVideo')}
          title={t('call.acceptVideo')}
          data-testid="dm-call-accept-video"
        >
          <VideoIcon size={18} />
        </IconButton>
      )}
    </div>
  );
}

function ControlButton({
  onClick, label, active = true, danger = false, children, testId,
}: {
  onClick: () => void; label: string; active?: boolean; danger?: boolean; children: React.ReactNode; testId?: string;
}) {
  const cls = danger
    ? 'bg-red-500 text-white hover:bg-red-600'
    : active
      ? 'bg-white/10 text-lc-white hover:bg-white/20'
      : 'bg-lc-white text-lc-black hover:brightness-95';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${cls}`}
      aria-label={label}
      title={label}
      aria-pressed={danger ? undefined : !active}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export function DmCallView() {
  const { t } = useTranslation();
  const s = useDmCallStore();
  const viewRef = useRef<HTMLDivElement>(null);
  const { full, toggle: toggleFullscreen } = useCallFullscreen(viewRef);
  const author = useAuthor(s.peer);
  const remoteVideoRef = useStreamRef<HTMLVideoElement>(s.media.remoteScreen ?? s.media.remoteVideo);
  const localVideoRef = useStreamRef<HTMLVideoElement>(s.media.localVideo);
  if (!s.peer) return null;
  const name = displayNameFor(s.peer, author);
  const showRemoteVideo = Boolean(s.media.remoteScreen ?? s.media.remoteVideo);
  const line = statusLine(s.status, t);
  const ended = s.status === 'ended';
  const canShare = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);

  return (
    <div
      ref={viewRef}
      className={full
        ? 'fixed inset-0 z-[80] flex flex-col bg-black'
        : 'fixed inset-0 z-[80] flex flex-col bg-lc-black/95 backdrop-blur-sm sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[32rem] sm:w-[26rem] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-lc-border sm:shadow-2xl'}
      role="dialog"
      aria-label={name}
      data-testid="dm-call-view"
      data-status={s.status}
      data-fullscreen={full || undefined}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black" onDoubleClick={ended ? undefined : toggleFullscreen}>
        {!ended && (
          <div className="absolute right-3 top-3 z-10 hidden sm:block">
            <IconButton
              tone="overlay"
              onClick={toggleFullscreen}
              aria-label={full ? t('call.exitFullscreen') : t('call.fullscreen')}
              title={full ? t('call.exitFullscreen') : t('call.fullscreen')}
              data-testid="dm-call-fullscreen"
            >
              {full ? <MinimizeIcon size={18} /> : <MaximizeIcon size={18} />}
            </IconButton>
          </div>
        )}
        {showRemoteVideo ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-contain" data-testid="dm-call-remote-video" />
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <UserAvatar pubkey={s.peer} picture={author.picture} name={name} size={24} />
            <div className="text-lg font-bold text-lc-white">{name}</div>
            <div className="text-sm text-lc-muted" role="status">
              {ended
                ? t(`call.ended.${s.endReason ?? 'local-hangup'}`)
                : line ?? (s.connectedAt ? <CallTimer since={s.connectedAt} /> : null)}
            </div>
          </div>
        )}
        {s.media.localVideo && !ended && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`absolute bottom-3 right-3 rounded-xl border border-lc-border object-cover shadow-lg [transform:scaleX(-1)] ${full ? 'h-40 w-56 sm:h-44 sm:w-64' : 'h-32 w-24 sm:h-28 sm:w-20'}`}
            data-testid="dm-call-local-video"
          />
        )}
        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {showRemoteVideo && (
            <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-lc-white">
              {name}
              {' · '}
              {ended ? t(`call.ended.${s.endReason ?? 'local-hangup'}`) : line ?? (s.connectedAt ? <CallTimer since={s.connectedAt} /> : null)}
            </span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-lc-white" data-testid="dm-call-encrypted">
            <LockIcon size={11} />
            {t('call.encrypted')}
          </span>
          {s.relayOnly && (
            <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-lc-green" data-testid="dm-call-ip-hidden">
              <ShieldIcon size={11} />
              {t('call.ipHidden')}
            </span>
          )}
        </div>
      </div>
      {/* Shown on the ended card too: "Call failed" alone doesn't say that the
          microphone permission was refused. */}
      {s.error && <p className="px-4 pt-2 text-center text-xs text-red-400" role="alert">{s.error}</p>}
      <div className="flex shrink-0 items-center justify-center gap-3 px-4 py-4">
        {ended ? (
          <ControlButton onClick={() => s.dismiss()} label={t('call.close')} testId="dm-call-close">
            <CloseIcon size={20} />
          </ControlButton>
        ) : (
          <>
            <ControlButton
              onClick={() => s.setMic(!s.media.micOn)}
              label={s.media.micOn ? t('call.mute') : t('call.unmute')}
              active={s.media.micOn}
              testId="dm-call-mic"
            >
              {s.media.micOn ? <MicIcon size={20} /> : <MicOffIcon size={20} />}
            </ControlButton>
            <ControlButton
              onClick={() => void s.setCamera(!s.media.cameraOn)}
              label={s.media.cameraOn ? t('call.cameraOff') : t('call.cameraOn')}
              active={s.media.cameraOn}
              testId="dm-call-camera"
            >
              {s.media.cameraOn ? <VideoIcon size={20} /> : <VideoOffIcon size={20} />}
            </ControlButton>
            {s.media.cameraOn && (
              <ControlButton onClick={() => void s.flipCamera()} label={t('call.flip')} testId="dm-call-flip">
                <FlipCameraIcon size={20} />
              </ControlButton>
            )}
            {canShare && (
              <ControlButton
                onClick={() => void s.setScreenShare(!s.media.screenOn)}
                label={s.media.screenOn ? t('call.stopShare') : t('call.shareScreen')}
                active={!s.media.screenOn}
                testId="dm-call-screen"
              >
                <ScreenShareIcon size={20} />
              </ControlButton>
            )}
            <ControlButton onClick={() => s.hangup()} label={t('call.hangup')} danger testId="dm-call-hangup">
              <PhoneOffIcon size={20} />
            </ControlButton>
          </>
        )}
      </div>
    </div>
  );
}

export function DmCallLayer() {
  const loggedIn = useIsLoggedIn();
  const status = useDmCallStore((s) => s.status);
  const remoteAudio = useDmCallStore((s) => s.media.remoteAudio);
  const audioRef = useStreamRef<HTMLAudioElement>(remoteAudio);

  useEffect(() => {
    if (!loggedIn) return;
    let off: (() => void) | null = null;
    let cancelled = false;
    void initDmCalls().then((u) => { if (cancelled) u(); else off = u; });
    return () => {
      cancelled = true;
      off?.();
      // Logging out or switching account ends whatever call was going on.
      useDmCallStore.getState().hangup();
    };
  }, [loggedIn]);

  return (
    <>
      <audio ref={audioRef} autoPlay className="hidden" data-testid="dm-call-audio" />
      {status === 'incoming' && <IncomingCallBanner />}
      {status !== 'idle' && status !== 'incoming' && <DmCallView />}
    </>
  );
}
