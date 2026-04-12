'use client';

import { useState } from 'react';
import { useVoiceStore } from '@/store/voice';
import { getVoiceQuality, setVoiceQuality } from '@/lib/voice';

interface VoiceControlsProps {
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
}

export default function VoiceControls({
  isMuted, isDeafened,
  onToggleMute, onToggleDeafen, onLeave,
  onToggleCamera, onToggleScreenShare,
}: VoiceControlsProps) {
  const { connectionState, error, isCameraOn, isScreenSharing } = useVoiceStore();
  const [showSettings, setShowSettings] = useState(false);
  const [quality, setQuality] = useState(() => getVoiceQuality());

  const updateQuality = (patch: Partial<ReturnType<typeof getVoiceQuality>>) => {
    setVoiceQuality(patch);
    setQuality(getVoiceQuality());
  };

  return (
    <div className="px-2 sm:px-4 py-3 border-t border-lc-border bg-lc-dark flex flex-col items-center gap-2 safe-bottom" data-testid="voice-controls">
      {/* Connection state / error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-600/10 px-3 py-1 rounded-full" data-testid="voice-error">{error}</p>
      )}
      {connectionState === 'connecting' && (
        <p className="text-xs text-lc-muted animate-pulse">Connecting…</p>
      )}

      <div className="flex items-center justify-center flex-wrap gap-2 sm:gap-3 max-w-full">
        {/* Mute */}
        <button
          onClick={onToggleMute}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isMuted
              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              : 'bg-lc-border text-lc-white hover:bg-lc-border/80'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
          data-testid="mute-btn"
        >
          {isMuted ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .74-.11 1.46-.33 2.13"/>
              <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          )}
        </button>

        {/* Deafen */}
        <button
          onClick={onToggleDeafen}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isDeafened
              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              : 'bg-lc-border text-lc-white hover:bg-lc-border/80'
          }`}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
          data-testid="deafen-btn"
        >
          {isDeafened ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M16.5 12.5a5 5 0 0 0-8-4"/>
              <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>
            </svg>
          )}
        </button>

        {/* Camera */}
        <button
          onClick={onToggleCamera}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isCameraOn
              ? 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30'
              : 'bg-lc-border text-lc-white hover:bg-lc-border/80'
          }`}
          title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          data-testid="camera-btn"
        >
          {isCameraOn ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z"/>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"/>
              <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/>
            </svg>
          )}
        </button>

        {/* Screen Share */}
        <button
          onClick={onToggleScreenShare}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isScreenSharing
              ? 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30'
              : 'bg-lc-border text-lc-white hover:bg-lc-border/80'
          }`}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
          data-testid="screen-share-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
            {isScreenSharing && <path d="M8 10l3 3 5-6" stroke="currentColor" strokeWidth="2"/>}
          </svg>
        </button>

        {/* Settings */}
        <div className="relative">
          <button
            onClick={() => setShowSettings((s) => !s)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              showSettings
                ? 'bg-lc-green/20 text-lc-green'
                : 'bg-lc-border text-lc-white hover:bg-lc-border/80'
            }`}
            title="Voice settings"
            data-testid="voice-settings-btn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.14.35.37.64.66.85.29.21.64.32 1 .34H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          {showSettings && (
            <div className="absolute bottom-12 right-0 w-[min(18rem,calc(100vw-1rem))] p-4 rounded-xl bg-lc-dark border border-lc-border shadow-2xl z-50 text-xs text-lc-white space-y-3 lc-glow" data-testid="voice-settings-panel">
              <div className="flex items-center justify-between pb-2 border-b border-lc-border">
                <h3 className="text-sm font-semibold text-lc-white">Voice settings</h3>
                <span className="text-[10px] uppercase tracking-wider text-lc-green">Quality</span>
              </div>
              <LcSelect
                label="Camera resolution"
                value={`${quality.cameraWidth}x${quality.cameraHeight}`}
                onChange={(v) => {
                  const [w, h] = v.split('x').map(Number);
                  updateQuality({ cameraWidth: w, cameraHeight: h });
                }}
                options={[
                  { value: '640x480', label: '480p (640×480)' },
                  { value: '1280x720', label: '720p (1280×720)' },
                  { value: '1920x1080', label: '1080p (1920×1080)' },
                ]}
              />
              <LcSelect
                label="Camera framerate"
                value={String(quality.cameraFps)}
                onChange={(v) => updateQuality({ cameraFps: Number(v) })}
                options={[
                  { value: '15', label: '15 fps' },
                  { value: '30', label: '30 fps' },
                  { value: '60', label: '60 fps' },
                ]}
              />
              <LcSelect
                label="Screen-share framerate"
                value={String(quality.screenFps)}
                onChange={(v) => updateQuality({ screenFps: Number(v) })}
                options={[
                  { value: '15', label: '15 fps' },
                  { value: '30', label: '30 fps' },
                  { value: '60', label: '60 fps' },
                ]}
              />
              <p className="text-[10px] text-lc-muted pt-1 border-t border-lc-border/60">Applies the next time you start camera / screen share.</p>
            </div>
          )}
        </div>

        {/* Disconnect */}
        <button
          onClick={onLeave}
          className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white transition-colors"
          title="Disconnect"
          data-testid="leave-voice-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
            <line x1="23" y1="1" x2="1" y2="23"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

interface LcSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function LcSelect({ label, value, onChange, options }: LcSelectProps) {
  return (
    <label className="block group">
      <span className="block text-[11px] font-medium text-lc-muted mb-1.5 group-focus-within:text-lc-green transition-colors">
        {label}
      </span>
      <div className="relative">
        <select
          className="w-full appearance-none bg-lc-black border border-lc-border rounded-lg pl-3 pr-9 py-2 text-xs text-lc-white cursor-pointer hover:border-lc-green/50 focus:border-lc-green focus:outline-none focus:ring-2 focus:ring-lc-green/30 transition-colors"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-lc-dark text-lc-white">
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-lc-muted group-focus-within:text-lc-green transition-colors"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </label>
  );
}
