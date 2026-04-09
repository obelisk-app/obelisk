'use client';

interface VoiceControlsProps {
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onLeave: () => void;
}

export default function VoiceControls({ isMuted, isDeafened, onToggleMute, onToggleDeafen, onLeave }: VoiceControlsProps) {
  return (
    <div className="px-4 py-3 border-t border-lc-border bg-lc-dark flex items-center justify-center gap-3" data-testid="voice-controls">
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
  );
}
