'use client';

/**
 * Floating control bar for an active voice channel.
 * Renders as a centered pill with backdrop blur — caller places it
 * absolutely or in a flex column footer.
 */
import { useState } from 'react';
import { useVoiceStore } from '@/store/voice';
import { getActiveVoiceClient } from '@/lib/voice/active-client';
import { VIDEO_QUALITIES, type VideoQuality } from '@/lib/voice/quality';

interface VoiceControlsProps {
  onLeave: () => void;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
}

export default function VoiceControls({ onLeave, isChatOpen, onToggleChat }: VoiceControlsProps) {
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const error = useVoiceStore((s) => s.error);
  const setError = useVoiceStore((s) => s.setError);
  const videoQuality = useVoiceStore((s) => s.videoQuality);
  const receivedVideoQuality = useVoiceStore((s) => s.receivedVideoQuality);
  const setVideoQuality = useVoiceStore((s) => s.setVideoQuality);
  const setReceivedVideoQuality = useVoiceStore((s) => s.setReceivedVideoQuality);
  const [qualityOpen, setQualityOpen] = useState(false);

  const handleSetVideoQuality = async (q: VideoQuality) => {
    setVideoQuality(q);
    const client = getActiveVoiceClient();
    if (client) {
      try { await client.applyVideoQuality(q); }
      catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    }
  };

  const handleSetReceivedQuality = async (q: VideoQuality) => {
    setReceivedVideoQuality(q);
    const client = getActiveVoiceClient();
    if (client) {
      try { await client.broadcastReceivedQuality(q); }
      catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    }
  };

  const handleToggleMute = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    try {
      await client.setMicEnabled(isMuted);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggleDeafen = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    const next = !isDeafened;
    client.setDeafenEnabled(next);
    useVoiceStore.getState().setDeafened(next);
    if (next && !isMuted) {
      try { await client.setMicEnabled(false); } catch { /* ignore */ }
    }
  };

  const handleToggleCamera = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    try {
      await client.setCameraEnabled(!isCameraOn);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err?.name === 'NotAllowedError') return;
      setError(err?.message || 'Failed to toggle camera');
    }
  };

  const handleToggleScreenShare = async () => {
    const client = getActiveVoiceClient();
    if (!client) return;
    try {
      await client.setScreenShareEnabled(!isScreenSharing);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err?.name === 'NotAllowedError') return;
      setError(err?.message || 'Failed to share screen');
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 pointer-events-none" data-testid="voice-controls">
      {error && (
        <div
          className="pointer-events-auto text-xs text-red-200 bg-red-600/30 backdrop-blur-md border border-red-500/30 px-3 py-1.5 rounded-full shadow-lg"
          data-testid="voice-error"
        >
          {error}
        </div>
      )}
      <div
        className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0))' }}
      >
        <CircleBtn
          active={!isMuted}
          danger={isMuted}
          onClick={handleToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
          data-testid="mute-btn"
        >
          {isMuted ? <MicOffIcon /> : <MicOnIcon />}
        </CircleBtn>

        <CircleBtn
          active={!isDeafened}
          danger={isDeafened}
          onClick={handleToggleDeafen}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
          data-testid="deafen-btn"
          className="hidden sm:flex"
        >
          {isDeafened ? <DeafenOffIcon /> : <DeafenOnIcon />}
        </CircleBtn>

        <CircleBtn
          active={isCameraOn}
          onClick={handleToggleCamera}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          data-testid="camera-btn"
        >
          {isCameraOn ? <CameraOnIcon /> : <CameraOffIcon />}
        </CircleBtn>

        <CircleBtn
          active={isScreenSharing}
          onClick={handleToggleScreenShare}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          data-testid="screen-share-btn"
          className="hidden sm:flex"
        >
          <ScreenShareIcon sharing={isScreenSharing} />
        </CircleBtn>

        {onToggleChat && (
          <CircleBtn
            active={!!isChatOpen}
            onClick={onToggleChat}
            title={isChatOpen ? 'Hide chat' : 'Show chat'}
            data-testid="voice-chat-toggle"
          >
            <ChatIcon />
          </CircleBtn>
        )}

        <div className="relative">
          <CircleBtn
            active={qualityOpen}
            onClick={() => setQualityOpen((v) => !v)}
            title="Video quality"
            data-testid="quality-btn"
          >
            <GearIcon />
          </CircleBtn>
          {qualityOpen && (
            <div
              className="absolute bottom-full mb-3 right-0 w-64 rounded-2xl bg-black/90 backdrop-blur-xl border border-white/10 shadow-2xl p-3 text-white/90"
              data-testid="quality-popover"
            >
              <QualitySection
                label="My camera"
                value={videoQuality}
                onChange={(q) => { void handleSetVideoQuality(q); }}
                testid="quality-out"
              />
              <div className="h-px bg-white/10 my-3" />
              <QualitySection
                label="Incoming"
                value={receivedVideoQuality}
                onChange={(q) => { void handleSetReceivedQuality(q); }}
                testid="quality-in"
              />
              <p className="text-[10px] text-white/40 mt-2">Audio is always sent at high quality.</p>
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-white/10 mx-1" aria-hidden />

        <button
          onClick={onLeave}
          className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-500 active:bg-red-700 flex items-center justify-center text-white transition-colors shadow-lg shadow-red-900/40"
          title="Disconnect"
          data-testid="leave-voice-btn"
        >
          <LeaveIcon />
        </button>
      </div>
    </div>
  );
}

function CircleBtn({
  active,
  danger,
  onClick,
  title,
  children,
  className,
  ...rest
}: {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={
        'w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 ' +
        (danger
          ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25 ring-1 ring-red-500/30'
          : active
            ? 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30 ring-1 ring-lc-green/40'
            : 'bg-white/5 text-white/85 hover:bg-white/10 ring-1 ring-white/10') +
        (className ? ' ' + className : '')
      }
    >
      {children}
    </button>
  );
}

function QualitySection({
  label,
  value,
  onChange,
  testid,
}: {
  label: string;
  value: VideoQuality;
  onChange: (q: VideoQuality) => void;
  testid: string;
}) {
  return (
    <div data-testid={testid}>
      <div className="text-xs uppercase tracking-wider text-white/50 mb-1.5">{label}</div>
      <div className="flex gap-1">
        {VIDEO_QUALITIES.map((q) => (
          <button
            key={q}
            onClick={() => onChange(q)}
            data-testid={`${testid}-${q}`}
            className={
              'flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition ' +
              (value === q
                ? 'bg-lc-green/25 text-lc-green ring-1 ring-lc-green/40'
                : 'bg-white/5 text-white/75 hover:bg-white/10')
            }
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function MicOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function MicOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .74-.11 1.46-.33 2.13" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
function DeafenOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}
function DeafenOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.5 12.5a5 5 0 0 0-8-4" />
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />
    </svg>
  );
}
function CameraOnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}
function CameraOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34" />
    </svg>
  );
}
function ScreenShareIcon({ sharing }: { sharing: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      {sharing && <path d="M8 10l3 3 5-6" />}
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function LeaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}
