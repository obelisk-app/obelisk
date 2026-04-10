'use client';

import { useEffect, useRef } from 'react';
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

/** Mounts an HTMLVideoElement into a container div */
function VideoContainer({ videoElement, className }: { videoElement: HTMLVideoElement | null; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !videoElement) return;
    videoElement.className = 'w-full h-full object-cover';
    container.appendChild(videoElement);
    return () => {
      if (container.contains(videoElement)) container.removeChild(videoElement);
    };
  }, [videoElement]);

  return <div ref={containerRef} className={className} />;
}

/** Local camera preview using a MediaStream */
function LocalVideoPreview({ stream, className }: { stream: MediaStream; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted className={className} />;
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
    error,
    isCameraOn,
    isScreenSharing,
    remoteVideos,
    remoteScreens,
    videoElements,
    screenElements,
    localCameraStream,
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

  // Collect all screen shares (remote + local)
  const screenSharers: { pubkey: string; element: HTMLVideoElement | null; isLocal: boolean }[] = [];
  for (const pubkey of remoteScreens) {
    screenSharers.push({ pubkey, element: screenElements.get(pubkey) || null, isLocal: false });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="voice-channel">
      {/* Error display (visible even when not connected) */}
      {error && !isInThisChannel && (
        <div className="px-6 pt-4">
          <p className="text-xs text-red-400 bg-red-600/10 px-3 py-2 rounded-lg text-center" data-testid="voice-join-error">{error}</p>
        </div>
      )}

      {/* Main content area */}
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
          <>
            {/* Screen share view — dominant, full width */}
            {screenSharers.length > 0 && (
              <div className="mb-4 space-y-3" data-testid="screen-share-area">
                {screenSharers.map(({ pubkey, element }) => {
                  const profile = profileCache.get(pubkey);
                  const name = profile?.name || pubkey.slice(0, 8) + '...';
                  return (
                    <div key={`screen-${pubkey}`} className="rounded-xl border border-lc-green/30 bg-lc-dark overflow-hidden">
                      <div className="px-3 py-1.5 bg-lc-green/10 border-b border-lc-green/20 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round">
                          <rect x="2" y="3" width="20" height="14" rx="2"/>
                          <line x1="8" y1="21" x2="16" y2="21"/>
                          <line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                        <span className="text-xs text-lc-green font-medium">{name} is sharing their screen</span>
                      </div>
                      <VideoContainer
                        videoElement={element}
                        className="w-full aspect-video bg-black"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Local screen share indicator */}
            {isScreenSharing && !screenSharers.some(s => s.isLocal) && (
              <div className="mb-4 rounded-xl border border-lc-green/30 bg-lc-dark p-3 text-center" data-testid="local-screen-share-indicator">
                <div className="flex items-center justify-center gap-2 text-lc-green text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                    <line x1="8" y1="21" x2="16" y2="21"/>
                    <line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                  You are sharing your screen
                </div>
              </div>
            )}

            {/* Participant grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {voiceParticipants.map((participant) => {
                const profile = profileCache.get(participant.pubkey);
                const name = profile?.name || participant.pubkey.slice(0, 8) + '...';
                const hasRemoteVideo = remoteVideos.has(participant.pubkey);
                const remoteVideoEl = hasRemoteVideo ? videoElements.get(participant.pubkey) || null : null;
                // Check if this is us with camera on
                const isLocalWithCamera = isCameraOn && isInThisChannel && currentVoiceChannelId === channelId
                  && !hasRemoteVideo && localCameraStream
                  // Heuristic: if we're not in remoteVideos, we're the local user
                  && !remoteVideos.has(participant.pubkey);

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
                      {/* Video or avatar */}
                      {hasRemoteVideo && remoteVideoEl ? (
                        <VideoContainer
                          videoElement={remoteVideoEl}
                          className={`w-16 h-16 rounded-full overflow-hidden ${
                            !participant.muted ? 'ring-2 ring-lc-green/50' : ''
                          }`}
                        />
                      ) : isLocalWithCamera && localCameraStream ? (
                        <div className={`w-16 h-16 rounded-full overflow-hidden ${
                          !participant.muted ? 'ring-2 ring-lc-green/50' : ''
                        }`}>
                          <LocalVideoPreview stream={localCameraStream} className="w-full h-full object-cover" />
                        </div>
                      ) : profile?.picture ? (
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
                      {/* Camera indicator badge */}
                      {(hasRemoteVideo || (isLocalWithCamera && localCameraStream)) && (
                        <div className="absolute -top-1 -right-1 bg-lc-green rounded-full p-0.5" data-testid="camera-badge">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M23 7l-7 5 7 5V7z"/>
                            <rect x="1" y="5" width="15" height="14" rx="2"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-lc-white font-medium text-center truncate w-full">{name}</span>
                  </div>
                );
              })}
            </div>
          </>
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
