'use client';

/**
 * Persistent mini-bar shown above the user pill at the bottom of the sidebar
 * whenever a call is active. Lets the user mute / deafen / toggle camera /
 * toggle screen-share / leave without navigating back to /app/voice/<id>.
 *
 * Reads state from `useVoiceStore`; dispatches actions through the active
 * VoiceClient. Clicking the channel pill jumps the AppShell view back to
 * the voice channel.
 */
import { useEffect, useState } from 'react';
import { useGroups } from '@/services/nostr-bridge';
import { useVoiceStore } from '@/store/voice';
import { getActiveVoiceClient, setActiveVoiceClient } from '@/services/voice/active-client';
import { requestVoiceJump } from '@/services/voice/jump-to-voice';
import { useTranslations } from 'next-intl';
import {
  CameraOffIcon, CameraOnIcon, DeafenOffIcon, DeafenOnIcon, LeaveIcon, MicOffIcon, MicOnIcon,
  ScreenShareIcon, SignalIcon, SwitchCameraIcon,
} from './icons';

export default function VoiceStatusBar() {
  const t = useTranslations();
  const channelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const relayUrl = useVoiceStore((s) => s.currentVoiceRelayUrl);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const isSignalingDegraded = useVoiceStore((s) => s.isSignalingDegraded);
  const groups = useGroups();
  const group = channelId ? groups.find((g) => g.id === channelId) : null;
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const devices = await navigator.mediaDevices?.enumerateDevices?.();
        if (cancelled) return;
        const cams = (devices ?? []).filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(cams.length > 1);
      } catch (err) {
        // Only the switch-camera button depends on this; say why it is missing.
        console.warn('[voice] enumerateDevices failed; the switch-camera button stays hidden', err);
      }
    };
    void check();
    const onChange = () => { void check(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
    };
  }, []);

  if (!channelId) return null;

  const handleToggleMute = async () => {
    const c = getActiveVoiceClient();
    if (!c) return;
    // Same surface as the in-room controls: a denied microphone from the
    // sidebar must say so, not leave the button doing nothing.
    try { await c.setMicEnabled(isMuted); }
    catch (e) { useVoiceStore.getState().setError(e instanceof Error ? e.message : String(e)); }
  };

  const handleToggleDeafen = () => {
    const c = getActiveVoiceClient();
    if (!c) return;
    const next = !isDeafened;
    c.setDeafenEnabled(next);
    useVoiceStore.getState().setDeafened(next);
    if (next && !isMuted) { void c.setMicEnabled(false); }
  };

  const handleToggleCamera = async () => {
    const c = getActiveVoiceClient();
    if (!c) return;
    try { await c.setCameraEnabled(!isCameraOn); }
    catch (err) {
      const e = err as { name?: string };
      if (e?.name !== 'NotAllowedError') {
        useVoiceStore.getState().setError((err as Error).message);
      }
    }
  };

  const handleSwitchCamera = async () => {
    const c = getActiveVoiceClient();
    if (!c) return;
    try { await c.switchCamera(); }
    catch (err) {
      const e = err as { name?: string };
      if (e?.name !== 'NotAllowedError') {
        useVoiceStore.getState().setError((err as Error).message);
      }
    }
  };

  const handleToggleScreen = async () => {
    const c = getActiveVoiceClient();
    if (!c) return;
    try { await c.setScreenShareEnabled(!isScreenSharing); }
    catch (err) {
      const e = err as { name?: string };
      if (e?.name !== 'NotAllowedError') {
        useVoiceStore.getState().setError((err as Error).message);
      }
    }
  };

  // Mirror the in-room "Leave" flow from VoiceRoom.leave() so the status-bar
  // hangup button has the same effect: tear down the client, clear the active
  // client ref, and reset the global voice store. Without the last two steps
  // the bar would stick around in a half-disconnected state.
  const handleLeave = async () => {
    const c = getActiveVoiceClient();
    if (c) {
      // The client releases its media before anything that can throw, so
      // the user is off the air; drop the call locally and say what failed.
      try { await c.leave(); }
      catch (err) { console.warn('[voice] leave failed; the call was dropped locally anyway', err); }
    }
    setActiveVoiceClient(null);
    useVoiceStore.getState().leaveVoice();
  };

  const handleJump = () => {
    if (!channelId) return;
    // Hand off to the AppShell-level subscriber. If the call's home relay
    // differs from the active bridge relay, the subscriber switches first
    // so `useGroups()` resolves the channel before we set the view.
    requestVoiceJump({ channelId, relayUrl: relayUrl ?? null });
  };

  return (
    <div className="px-2 pt-2" data-testid="voice-status-bar">
      <div className="bg-lc-black/60 border border-lc-border rounded-xl p-2 space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleJump}
            className="flex-1 min-w-0 flex items-center gap-2 text-left hover:bg-lc-border/30 rounded-md px-1.5 py-1 transition"
            title={t('voice.goToChannel')}
          >
            <span className="shrink-0 w-8 h-8 rounded-md bg-lc-green/10 flex items-center justify-center text-lc-green">
              <SignalIcon size={16} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              {isSignalingDegraded ? (
                <span className="block text-sm text-amber-300 font-semibold" data-testid="voice-bar-reconnecting">
                  {t('voice.reconnectingSignaling')}
                </span>
              ) : (
                <span className="block text-sm text-lc-green font-semibold">{t('voice.connected')}</span>
              )}
              <span className="block text-xs text-lc-muted truncate">
                {group?.name ?? `${channelId.slice(0, 8)}…`}
              </span>
            </span>
          </button>
          <button
            onClick={handleLeave}
            className="w-7 h-7 rounded-md bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors"
            title={t('voice.disconnect')}
            data-testid="voice-bar-leave"
          >
            <LeaveIcon size={14} />
          </button>
        </div>

        <div className="flex items-center gap-1 w-full">
          <SmallBtn active={!isMuted} danger={isMuted} onClick={handleToggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted ? <MicOffIcon size={14} /> : <MicOnIcon size={14} />}
          </SmallBtn>
          <SmallBtn active={!isDeafened} danger={isDeafened} onClick={handleToggleDeafen} title={isDeafened ? 'Undeafen' : 'Deafen'}>
            {isDeafened ? <DeafenOffIcon size={14} /> : <DeafenOnIcon size={14} />}
          </SmallBtn>
          <SmallBtn active={isCameraOn} onClick={handleToggleCamera} title={isCameraOn ? 'Camera off' : 'Camera on'} data-testid="voice-bar-camera">
            {isCameraOn ? <CameraOnIcon size={14} /> : <CameraOffIcon size={14} />}
          </SmallBtn>
          {isCameraOn && hasMultipleCameras && (
            <SmallBtn active={false} onClick={handleSwitchCamera} title={t('voice.switchCamera')} data-testid="voice-bar-switch-camera">
              <SwitchCameraIcon size={14} />
            </SmallBtn>
          )}
          <SmallBtn active={isScreenSharing} onClick={handleToggleScreen} title={isScreenSharing ? 'Stop sharing' : 'Share screen'} data-testid="voice-bar-screenshare">
            <ScreenShareIcon size={14} sharing={isScreenSharing} />
          </SmallBtn>
        </div>
      </div>
    </div>
  );
}

function SmallBtn({
  active,
  danger,
  onClick,
  title,
  children,
  ...rest
}: {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      onClick={onClick}
      title={title}
      className={
        'flex-1 h-8 rounded-md flex items-center justify-center transition-colors ' +
        (danger
          ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
          : active
            ? 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30'
            : 'bg-lc-border/40 hover:bg-lc-border/60 text-lc-muted hover:text-lc-white')
      }
    >
      {children}
    </button>
  );
}
