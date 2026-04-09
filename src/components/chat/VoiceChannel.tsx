'use client';

import { useEffect } from 'react';
import { useVoiceStore } from '@/store/voice';
import VoiceControls from './VoiceControls';

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
  profileCache: Map<string, { name?: string; picture?: string }>;
  onJoin: (channelId: string) => void;
  onLeave: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
}

export default function VoiceChannel({
  channelId,
  channelName,
  profileCache,
  onJoin,
  onLeave,
  onToggleMute,
  onToggleDeafen,
  onToggleCamera,
  onToggleScreenShare,
}: VoiceChannelProps) {
  const {
    currentVoiceChannelId,
    voiceParticipants,
    isMuted,
    isDeafened,
    isConnecting,
  } = useVoiceStore();

  const isInThisChannel = currentVoiceChannelId === channelId;

  // Fetch participants when viewing a voice channel
  useEffect(() => {
    fetch(`/api/channels/${channelId}/voice`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          useVoiceStore.getState().setParticipants(data.participants);
        }
      })
      .catch(() => {});
  }, [channelId]);

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="voice-channel">
      {/* Participant grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {voiceParticipants.length === 0 && !isInThisChannel && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-lc-muted">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4 opacity-30">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
              <p className="text-lg font-medium mb-2">Voice Channel — #{channelName}</p>
              <p className="text-sm mb-4">No one is here yet</p>
              <button
                onClick={() => onJoin(channelId)}
                disabled={isConnecting}
                className="lc-pill-primary px-6 py-2.5 text-sm font-medium disabled:opacity-50"
                data-testid="join-voice-btn"
              >
                {isConnecting ? 'Connecting...' : 'Join Voice'}
              </button>
            </div>
          </div>
        )}

        {(voiceParticipants.length > 0 || isInThisChannel) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {voiceParticipants.map((participant) => {
              const profile = profileCache.get(participant.pubkey);
              const name = profile?.name || participant.pubkey.slice(0, 8) + '...';

              return (
                <div
                  key={participant.pubkey}
                  className={`flex flex-col items-center p-4 rounded-xl border transition-colors ${
                    participant.muted
                      ? 'bg-lc-dark border-lc-border'
                      : 'bg-lc-dark border-lc-green/30'
                  }`}
                  data-testid="voice-participant"
                >
                  <div className="relative mb-2">
                    {profile?.picture ? (
                      <img
                        src={profile.picture}
                        alt={name}
                        className={`w-16 h-16 rounded-full object-cover ${
                          !participant.muted ? 'ring-2 ring-lc-green/50' : ''
                        }`}
                      />
                    ) : (
                      <div className={`w-16 h-16 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-lg font-semibold ${
                        !participant.muted ? 'ring-2 ring-lc-green/50' : ''
                      }`}>
                        {name[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    {/* Mute/deafen indicators */}
                    {(participant.muted || participant.deafened) && (
                      <div className="absolute -bottom-1 -right-1 bg-lc-dark border border-lc-border rounded-full p-1">
                        {participant.deafened ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="1" y1="1" x2="23" y2="23"/>
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                            <path d="M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                          </svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="1" y1="1" x2="23" y2="23"/>
                            <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-lc-white font-medium text-center truncate w-full">{name}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Join button when others are in the channel but we're not */}
        {voiceParticipants.length > 0 && !isInThisChannel && (
          <div className="flex justify-center mt-6">
            <button
              onClick={() => onJoin(channelId)}
              disabled={isConnecting}
              className="lc-pill-primary px-6 py-2.5 text-sm font-medium disabled:opacity-50"
              data-testid="join-voice-btn"
            >
              {isConnecting ? 'Connecting...' : 'Join Voice'}
            </button>
          </div>
        )}
      </div>

      {/* Voice controls bar (shown when in channel) */}
      {isInThisChannel && (
        <VoiceControls
          isMuted={isMuted}
          isDeafened={isDeafened}
          onToggleMute={onToggleMute}
          onToggleDeafen={onToggleDeafen}
          onLeave={onLeave}
          onToggleCamera={onToggleCamera}
          onToggleScreenShare={onToggleScreenShare}
        />
      )}
    </div>
  );
}
