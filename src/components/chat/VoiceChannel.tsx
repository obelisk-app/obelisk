'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useVoiceStore } from '@/store/voice';
import VoiceControls from './VoiceControls';
import { shortNpub } from '@/lib/mentions';

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

/** Name overlay at bottom of a video tile */
function NameOverlay({ name, muted, deafened }: { name: string; muted?: boolean; deafened?: boolean }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 flex items-center gap-2">
      <span className="text-xs text-white font-medium truncate">{name}</span>
      {(muted || deafened) && (
        <span className="flex-shrink-0">
          {deafened ? (
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
        </span>
      )}
    </div>
  );
}

/** Compact audio-only participant (small avatar + name) */
function AudioParticipantBadge({ pubkey, profile, muted, deafened }: {
  pubkey: string;
  profile?: { name?: string; picture?: string };
  muted: boolean;
  deafened: boolean;
}) {
  const name = profile?.name || shortNpub(pubkey);
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        muted ? 'bg-lc-dark border-lc-border' : 'bg-lc-dark border-lc-green/30'
      }`}
      data-testid="voice-participant"
    >
      {profile?.picture ? (
        <img src={profile.picture} alt={name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold flex-shrink-0">
          {name[0]?.toUpperCase() || '?'}
        </div>
      )}
      <span className="text-xs text-lc-white font-medium truncate">{name}</span>
      {(muted || deafened) && (
        <span className="flex-shrink-0 ml-auto">
          {deafened ? (
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
        </span>
      )}
    </div>
  );
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
    focusedPubkey,
  } = useVoiceStore();

  const setFocusedPubkey = useVoiceStore((s) => s.setFocusedPubkey);
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

  // Determine which participants have video
  const hasVideo = useCallback((pubkey: string) => {
    if (remoteVideos.has(pubkey)) return true;
    // Local user with camera on
    if (isCameraOn && isInThisChannel && localCameraStream && !remoteVideos.has(pubkey)) {
      // Check if this pubkey is NOT in remoteVideos (meaning it's us)
      const isInRemote = remoteVideos.has(pubkey);
      if (!isInRemote) return true;
    }
    return false;
  }, [remoteVideos, isCameraOn, isInThisChannel, localCameraStream]);

  // Split participants into video and audio-only
  // We need to figure out which participant is "us" — the local user is the one not in remoteVideos
  // but who has isCameraOn. Since we don't have our own pubkey here, we use a heuristic:
  // if isCameraOn and localCameraStream exists, the participant NOT in remoteVideos is local.
  const videoParticipants = voiceParticipants.filter((p) => {
    if (remoteVideos.has(p.pubkey)) return true;
    // Local user with camera
    if (isCameraOn && isInThisChannel && localCameraStream && !remoteVideos.has(p.pubkey)) {
      // Only one participant should match this — the local user
      // Heuristic: if there's a localCameraStream and this pubkey isn't a remote video source
      return true;
    }
    return false;
  });

  // If camera is on but ALL participants show as video (including audio-only ones due to heuristic),
  // we need to be smarter. Actually the heuristic above would match ALL non-remote participants
  // when camera is on. Let's fix: only the first non-remote participant is local.
  const localPubkey = isCameraOn && isInThisChannel && localCameraStream
    ? voiceParticipants.find((p) => !remoteVideos.has(p.pubkey))?.pubkey
    : null;

  const videoParticipantsFinal = voiceParticipants.filter((p) => {
    if (remoteVideos.has(p.pubkey)) return true;
    if (p.pubkey === localPubkey) return true;
    return false;
  });

  const audioOnlyParticipants = voiceParticipants.filter((p) => {
    if (remoteVideos.has(p.pubkey)) return false;
    if (p.pubkey === localPubkey) return false;
    return true;
  });

  const anyVideoActive = videoParticipantsFinal.length > 0;

  // Collect screen shares
  const screenSharers: { pubkey: string; element: HTMLVideoElement | null }[] = [];
  for (const pubkey of remoteScreens) {
    screenSharers.push({ pubkey, element: screenElements.get(pubkey) || null });
  }

  // Handle focus click
  const handleFocusClick = (pubkey: string) => {
    if (focusedPubkey === pubkey) {
      setFocusedPubkey(null);
    } else {
      setFocusedPubkey(pubkey);
    }
  };

  // Handle double-click for fullscreen
  const handleDoubleClick = (e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen?.();
    }
  };

  // Render a video tile (used in both grid and focused view)
  const renderVideoTile = (pubkey: string, isFocused: boolean) => {
    const profile = profileCache.get(pubkey);
    const name = profile?.name || shortNpub(pubkey);
    const participant = voiceParticipants.find((p) => p.pubkey === pubkey);
    const isRemote = remoteVideos.has(pubkey);
    const remoteVideoEl = isRemote ? videoElements.get(pubkey) || null : null;
    const isLocal = pubkey === localPubkey;

    return (
      <div
        key={pubkey}
        className={`relative rounded-xl overflow-hidden cursor-pointer transition-all ${
          isFocused
            ? 'border-2 border-lc-green w-full aspect-video bg-black'
            : 'border border-lc-border hover:border-lc-green/50 aspect-video bg-black'
        }`}
        onClick={() => handleFocusClick(pubkey)}
        onDoubleClick={isFocused ? handleDoubleClick : undefined}
        data-testid={isFocused ? 'focused-video' : 'video-tile'}
      >
        {isRemote && remoteVideoEl ? (
          <VideoContainer videoElement={remoteVideoEl} className="w-full h-full" />
        ) : isLocal && localCameraStream ? (
          <LocalVideoPreview stream={localCameraStream} className="w-full h-full object-cover" />
        ) : null}
        <NameOverlay name={name} muted={participant?.muted} deafened={participant?.deafened} />
        {/* Camera badge */}
        <div className="absolute top-2 right-2 bg-lc-green rounded-full p-1" data-testid="camera-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round">
            <path d="M23 7l-7 5 7 5V7z"/>
            <rect x="1" y="5" width="15" height="14" rx="2"/>
          </svg>
        </div>
      </div>
    );
  };

  // Is the focused pubkey actually a video participant?
  const focusedIsVideo = focusedPubkey && videoParticipantsFinal.some((p) => p.pubkey === focusedPubkey);
  const focusedIsScreen = focusedPubkey && screenSharers.some((s) => s.pubkey === focusedPubkey);

  return (
    <div className="flex-1 flex flex-col min-h-0" data-testid="voice-channel">
      {/* Error display */}
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
            {/* Screen share view */}
            {screenSharers.length > 0 && (
              <div className="mb-4 space-y-3" data-testid="screen-share-area">
                {screenSharers.map(({ pubkey, element }) => {
                  const profile = profileCache.get(pubkey);
                  const name = profile?.name || shortNpub(pubkey);
                  const isFocused = focusedPubkey === pubkey;
                  return (
                    <div
                      key={`screen-${pubkey}`}
                      className={`rounded-xl overflow-hidden cursor-pointer transition-all ${
                        isFocused ? 'border-2 border-lc-green' : 'border border-lc-green/30 hover:border-lc-green/50'
                      } bg-lc-dark`}
                      onClick={() => handleFocusClick(pubkey)}
                      onDoubleClick={isFocused ? handleDoubleClick : undefined}
                    >
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
            {isScreenSharing && !screenSharers.some(s => remoteScreens.has(s.pubkey) && s.pubkey === localPubkey) && (
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

            {/* Focused view */}
            {focusedPubkey && focusedIsVideo && (
              <div className="mb-4" data-testid="focused-view">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-lc-muted">Focused view — click another tile to switch, double-click for fullscreen</span>
                  <button
                    onClick={() => setFocusedPubkey(null)}
                    className="text-lc-muted hover:text-lc-white transition-colors p-1"
                    data-testid="unfocus-btn"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
                {renderVideoTile(focusedPubkey, true)}
              </div>
            )}

            {/* Video participants grid */}
            {anyVideoActive && (
              <div className="mb-4">
                <div className={`grid gap-3 ${
                  focusedPubkey
                    ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6'
                    : videoParticipantsFinal.length === 1
                      ? 'grid-cols-1 max-w-2xl'
                      : videoParticipantsFinal.length === 2
                        ? 'grid-cols-2 max-w-3xl'
                        : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4'
                }`} data-testid="video-grid">
                  {videoParticipantsFinal
                    .filter((p) => p.pubkey !== focusedPubkey)
                    .map((p) => renderVideoTile(p.pubkey, false))}
                </div>
              </div>
            )}

            {/* Audio-only participants */}
            {audioOnlyParticipants.length > 0 && (
              <div data-testid="audio-participants">
                {anyVideoActive && (
                  <p className="text-xs text-lc-muted mb-2">Audio only</p>
                )}
                <div className={anyVideoActive
                  ? 'flex flex-wrap gap-2'
                  : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4'
                }>
                  {audioOnlyParticipants.map((participant) => {
                    const profile = profileCache.get(participant.pubkey);
                    const name = profile?.name || shortNpub(participant.pubkey);

                    if (anyVideoActive) {
                      // Compact badge when videos are active
                      return (
                        <AudioParticipantBadge
                          key={participant.pubkey}
                          pubkey={participant.pubkey}
                          profile={profile}
                          muted={participant.muted}
                          deafened={participant.deafened}
                        />
                      );
                    }

                    // Original card layout when no videos
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
              </div>
            )}
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

      {/* Voice controls bar */}
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
