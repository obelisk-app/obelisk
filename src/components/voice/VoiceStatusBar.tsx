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
import { useGroups } from '@/lib/nostr-bridge';
import { useVoiceStore } from '@/store/voice';
import { getActiveVoiceClient, setActiveVoiceClient } from '@/lib/voice/active-client';
import { requestVoiceJump } from '@/lib/voice/jump-to-voice';

export default function VoiceStatusBar() {
  const channelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const relayUrl = useVoiceStore((s) => s.currentVoiceRelayUrl);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
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
      } catch { /* ignore */ }
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
    try { await c.setMicEnabled(isMuted); } catch { /* swallow */ }
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
      try { await c.leave(); } catch { /* swallow */ }
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
            title="Go to voice channel"
          >
            <span className="shrink-0 w-8 h-8 rounded-md bg-lc-green/10 flex items-center justify-center text-lc-green">
              <SignalIcon />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm text-lc-green font-semibold">Voice connected</span>
              <span className="block text-xs text-lc-muted truncate">
                {group?.name ?? `${channelId.slice(0, 8)}…`}
              </span>
            </span>
          </button>
          <button
            onClick={handleLeave}
            className="w-7 h-7 rounded-md bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors"
            title="Disconnect"
            data-testid="voice-bar-leave"
          >
            <LeaveIcon />
          </button>
        </div>

        <div className="flex items-center gap-1 w-full">
          <SmallBtn active={!isMuted} danger={isMuted} onClick={handleToggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted ? <MicOff /> : <MicOn />}
          </SmallBtn>
          <SmallBtn active={!isDeafened} danger={isDeafened} onClick={handleToggleDeafen} title={isDeafened ? 'Undeafen' : 'Deafen'}>
            {isDeafened ? <DeafenOff /> : <DeafenOn />}
          </SmallBtn>
          <SmallBtn active={isCameraOn} onClick={handleToggleCamera} title={isCameraOn ? 'Camera off' : 'Camera on'} data-testid="voice-bar-camera">
            {isCameraOn ? <CameraOn /> : <CameraOff />}
          </SmallBtn>
          {isCameraOn && hasMultipleCameras && (
            <SmallBtn active={false} onClick={handleSwitchCamera} title="Switch camera" data-testid="voice-bar-switch-camera">
              <SwitchCamera />
            </SmallBtn>
          )}
          <SmallBtn active={isScreenSharing} onClick={handleToggleScreen} title={isScreenSharing ? 'Stop sharing' : 'Share screen'} data-testid="voice-bar-screenshare">
            <Screen sharing={isScreenSharing} />
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

function SignalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h2" /><path d="M6 8v8" /><path d="M10 4v16" /><path d="M14 8v8" /><path d="M18 10v4" /><path d="M22 12h-2" />
    </svg>
  );
}
function LeaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}
function MicOn() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function MicOff() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .74-.11 1.46-.33 2.13"/></svg>;
}
function DeafenOn() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>;
}
function DeafenOff() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.5 12.5a5 5 0 0 0-8-4"/><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/></svg>;
}
function CameraOn() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
}
function CameraOff() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/></svg>;
}
function SwitchCamera() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 4h-3.17L15 2H9L7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><path d="M9 13a3 3 0 0 0 5.5 1.66"/><path d="M15 11a3 3 0 0 0-5.5-1.66"/><polyline points="14.5 8.5 15 11 12.5 11.5"/><polyline points="9.5 15.5 9 13 11.5 12.5"/></svg>;
}
function Screen({ sharing }: { sharing: boolean }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>{sharing && <path d="M8 10l3 3 5-6"/>}</svg>;
}
