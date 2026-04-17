'use client';

import { useEffect, useRef, useCallback, useState, type ReactNode } from 'react';
import { useVoiceStore } from '@/store/voice';
import VoiceControls from './VoiceControls';
import { shortNpub } from '@/lib/mentions';
import ShootingStars from '@/components/ShootingStars';

type VoiceStoreState = ReturnType<typeof useVoiceStore.getState>;
type VoiceParticipantView = VoiceStoreState['voiceParticipants'][number];

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
  canModerate?: boolean;
  onModAction?: (targetPubkey: string, action: 'mute' | 'camera-off' | 'screen-off') => void;
  /**
   * Optional companion chat. Voice channels are regular text-capable channels
   * in the data model, so callers can pass the same MessageArea + MessageInput
   * they render for text channels here.
   */
  chatSlot?: ReactNode;
}

/** Speaker icon with a slash when muted — used for the per-peer local mute button. */
function LocalMuteIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {muted ? (
        <>
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </>
      )}
    </svg>
  );
}

/** Mounts an HTMLVideoElement into a container div */
function VideoContainer({ videoElement, className }: { videoElement: HTMLVideoElement | null; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !videoElement) return;
    videoElement.className = 'w-full h-full object-contain bg-black';
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
function AudioParticipantBadge({ pubkey, profile, muted, deafened, speaking, locallyMuted, onToggleLocalMute }: {
  pubkey: string;
  profile?: { name?: string; picture?: string };
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  locallyMuted: boolean;
  onToggleLocalMute?: () => void;
}) {
  const name = profile?.name || shortNpub(pubkey);
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
        speaking ? 'bg-lc-dark border-lc-green' : 'bg-lc-dark border-lc-border'
      } ${locallyMuted ? 'opacity-60' : ''}`}
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
      <span className="flex items-center gap-1 ml-auto flex-shrink-0">
        {(muted || deafened) && (
          deafened ? (
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
          )
        )}
        {onToggleLocalMute && (
          <button
            onClick={onToggleLocalMute}
            className={`p-0.5 rounded transition-colors ${
              locallyMuted ? 'text-red-400 hover:text-red-300' : 'text-lc-muted hover:text-lc-white'
            }`}
            title={locallyMuted ? 'Unmute for me' : 'Mute for me only'}
            data-testid="local-mute-btn"
          >
            <LocalMuteIcon muted={locallyMuted} />
          </button>
        )}
      </span>
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
  canModerate = false,
  onModAction,
  chatSlot,
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
    localScreenStream,
    focusedPubkey,
    limitNotice,
    speakingPubkeys,
    localMutedPubkeys,
    isVoiceChatOpen: chatOpen,
  } = useVoiceStore();

  const setFocusedPubkey = useVoiceStore((s: VoiceStoreState) => s.setFocusedPubkey);
  const setLimitNotice = useVoiceStore((s: VoiceStoreState) => s.setLimitNotice);
  const toggleLocalMute = useVoiceStore((s: VoiceStoreState) => s.toggleLocalMute);
  const setVoiceChatOpen = useVoiceStore((s: VoiceStoreState) => s.setVoiceChatOpen);
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
  const videoParticipants = voiceParticipants.filter((p: VoiceParticipantView) => {
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
    ? voiceParticipants.find((p: VoiceParticipantView) => !remoteVideos.has(p.pubkey))?.pubkey
    : null;

  const videoParticipantsFinal = voiceParticipants.filter((p: VoiceParticipantView) => {
    if (remoteVideos.has(p.pubkey)) return true;
    if (p.pubkey === localPubkey) return true;
    return false;
  });

  const audioOnlyParticipants = voiceParticipants.filter((p: VoiceParticipantView) => {
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

  // Toggle fullscreen on a given element.
  // iOS Safari only fullscreens <video> elements (webkitEnterFullscreen), not arbitrary divs,
  // so fall back to the first <video> inside the tile when the standard API is absent.
  const toggleFullscreen = (el: HTMLElement | null | undefined) => {
    if (!el) return;
    const doc = document as Document & {
      webkitFullscreenElement?: Element;
      webkitExitFullscreen?: () => void;
    };
    const fsEl = document.fullscreenElement || doc.webkitFullscreenElement;
    if (fsEl) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      return;
    }
    const anyEl = el as HTMLElement & {
      webkitRequestFullscreen?: () => void;
    };
    const afterEnter = () => {
      // On Android mobile, a landscape video in a portrait phone looks tiny.
      // Lock the screen to landscape so the video actually fills the display.
      const orientation = screen.orientation as (ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      }) | undefined;
      const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      if (isMobile && orientation?.lock) {
        // Pick orientation based on the video's intrinsic aspect ratio.
        const video = el.querySelector('video') as HTMLVideoElement | null;
        const wantLandscape = !video || video.videoWidth >= video.videoHeight;
        orientation.lock(wantLandscape ? 'landscape' : 'portrait').catch(() => {});
        const release = () => {
          if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
            try { screen.orientation.unlock?.(); } catch {}
            document.removeEventListener('fullscreenchange', release);
          }
        };
        document.addEventListener('fullscreenchange', release);
      }
    };
    if (el.requestFullscreen) {
      el.requestFullscreen().then(afterEnter).catch(() => tryVideoFullscreen(el));
    } else if (anyEl.webkitRequestFullscreen) {
      anyEl.webkitRequestFullscreen();
      afterEnter();
    } else {
      tryVideoFullscreen(el);
    }
  };
  const tryVideoFullscreen = (el: HTMLElement) => {
    const video = el.querySelector('video') as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitRequestFullscreen?: () => void;
    }) | null;
    if (!video) return;
    if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
    else if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
  };
  const handleDoubleClick = (e: React.MouseEvent) => {
    toggleFullscreen(e.currentTarget as HTMLElement);
  };
  const handleFullscreenBtn = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const tile = (e.currentTarget as HTMLElement).closest('[data-tile]') as HTMLElement | null;
    toggleFullscreen(tile);
  };
  const FullscreenBtn = () => (
    <button
      onClick={handleFullscreenBtn}
      className="absolute top-2 left-2 bg-black/50 hover:bg-black/70 rounded-full p-1.5 text-white transition-colors"
      title="Fullscreen"
      data-testid="fullscreen-btn"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M4 9V5a1 1 0 0 1 1-1h4"/>
        <path d="M20 9V5a1 1 0 0 0-1-1h-4"/>
        <path d="M4 15v4a1 1 0 0 0 1 1h4"/>
        <path d="M20 15v4a1 1 0 0 1-1 1h-4"/>
      </svg>
    </button>
  );

  // Render a video tile (used in both grid and focused view)
  const renderVideoTile = (pubkey: string, isFocused: boolean) => {
    const profile = profileCache.get(pubkey);
    const name = profile?.name || shortNpub(pubkey);
    const participant = voiceParticipants.find((p: VoiceParticipantView) => p.pubkey === pubkey);
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
        onDoubleClick={handleDoubleClick}
        data-tile
        data-testid={isFocused ? 'focused-video' : 'video-tile'}
      >
        {isRemote && remoteVideoEl ? (
          <VideoContainer videoElement={remoteVideoEl} className="w-full h-full" />
        ) : isLocal && localCameraStream ? (
          <LocalVideoPreview stream={localCameraStream} className="w-full h-full object-contain bg-black" />
        ) : null}
        <NameOverlay name={name} muted={participant?.muted} deafened={participant?.deafened} />
        <FullscreenBtn />
        {canModerate && !isLocal && onModAction && (
          <div className="absolute top-2 right-10 flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onModAction(pubkey, 'mute'); }}
              className="bg-black/60 hover:bg-red-600/80 rounded-full p-1.5 text-white"
              title="Mute user (mod)"
              data-testid="mod-mute-btn"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .74-.11 1.46-.33 2.13"/>
              </svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onModAction(pubkey, 'camera-off'); }}
              className="bg-black/60 hover:bg-red-600/80 rounded-full p-1.5 text-white"
              title="Turn off user's camera (mod)"
              data-testid="mod-camera-off-btn"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="1" y1="1" x2="23" y2="23"/>
                <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/>
              </svg>
            </button>
          </div>
        )}
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
  const focusedIsVideo = focusedPubkey && videoParticipantsFinal.some((p: VoiceParticipantView) => p.pubkey === focusedPubkey);
  const focusedIsScreen = focusedPubkey && screenSharers.some((s: { pubkey: string }) => s.pubkey === focusedPubkey);

  return (
    <div className="flex-1 flex min-h-0 p-2 relative" data-testid="voice-channel">
    {chatSlot && !chatOpen && (
      <button
        onClick={() => setVoiceChatOpen(true)}
        style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 50 }}
        className="p-2 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors backdrop-blur shadow-lg"
        title="Show chat"
        data-testid="voice-chat-toggle"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    )}
    <div className="flex-1 flex flex-col min-h-0 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 relative overflow-hidden rounded-xl border border-lc-border shadow-xl">
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none">
        <ShootingStars contained count={8} />
      </div>
      {/* Error display */}
      {error && !isInThisChannel && (
        <div className="relative z-10 px-6 pt-4">
          <p className="text-xs text-red-400 bg-red-600/10 px-3 py-2 rounded-lg text-center" data-testid="voice-join-error">{error}</p>
        </div>
      )}

      {/* Main content area */}
      <div className="relative z-10 flex-1 overflow-y-auto p-3 sm:p-6">
        {voiceParticipants.length === 0 && !isInThisChannel && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-2xl sm:text-3xl font-semibold text-white mb-2 flex items-center justify-center gap-2">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-80">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/>
                  <line x1="8" y1="23" x2="16" y2="23"/>
                </svg>
                <span>{channelName}</span>
              </p>
              <p className="text-sm text-white/70 mb-6">No one is in voice chat</p>
              <button
                onClick={() => onJoin(channelId)}
                disabled={isConnecting}
                className="bg-white hover:bg-white/90 text-lc-black px-6 py-2.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
                data-testid="join-voice-btn"
              >
                {isConnecting ? 'Connecting...' : 'Join voice channel'}
              </button>
            </div>
          </div>
        )}

        {(voiceParticipants.length > 0 || isInThisChannel) && (
          <>
            {/* Screen share view (remote + local) */}
            {(screenSharers.length > 0 || (isScreenSharing && localScreenStream)) && (
              <div className="mb-4 space-y-3" data-testid="screen-share-area">
                {isScreenSharing && localScreenStream && (
                  <div
                    key="screen-local"
                    className="rounded-xl overflow-hidden cursor-pointer transition-all border border-lc-green/30 hover:border-lc-green/50 bg-lc-dark relative"
                    onDoubleClick={handleDoubleClick}
                    data-tile
                    data-testid="local-screen-share"
                  >
                    <div data-screen-header className="px-3 py-1.5 bg-lc-green/10 border-b border-lc-green/20 flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round">
                        <rect x="2" y="3" width="20" height="14" rx="2"/>
                        <line x1="8" y1="21" x2="16" y2="21"/>
                        <line x1="12" y1="17" x2="12" y2="21"/>
                      </svg>
                      <span className="text-xs text-lc-green font-medium">You are sharing your screen</span>
                    </div>
                    <div data-screen-video className="relative w-full aspect-video bg-black">
                      <LocalVideoPreview stream={localScreenStream} className="w-full h-full object-contain bg-black" />
                      <FullscreenBtn />
                    </div>
                  </div>
                )}
                {screenSharers.map(({ pubkey, element }) => {
                  const profile = profileCache.get(pubkey);
                  const name = profile?.name || shortNpub(pubkey);
                  const isFocused = focusedPubkey === pubkey;
                  return (
                    <div
                      key={`screen-${pubkey}`}
                      className={`rounded-xl overflow-hidden cursor-pointer transition-all ${
                        isFocused ? 'border-2 border-lc-green' : 'border border-lc-green/30 hover:border-lc-green/50'
                      } bg-lc-dark relative`}
                      onClick={() => handleFocusClick(pubkey)}
                      onDoubleClick={handleDoubleClick}
                      data-tile
                    >
                      <div data-screen-header className="px-3 py-1.5 bg-lc-green/10 border-b border-lc-green/20 flex items-center gap-2">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round">
                          <rect x="2" y="3" width="20" height="14" rx="2"/>
                          <line x1="8" y1="21" x2="16" y2="21"/>
                          <line x1="12" y1="17" x2="12" y2="21"/>
                        </svg>
                        <span className="text-xs text-lc-green font-medium">{name} is sharing their screen</span>
                      </div>
                      <div data-screen-video className="relative w-full aspect-video bg-black">
                        <VideoContainer
                          videoElement={element}
                          className="w-full h-full"
                        />
                        <FullscreenBtn />
                        {canModerate && onModAction && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onModAction(pubkey, 'screen-off'); }}
                            className="absolute top-2 right-10 bg-black/60 hover:bg-red-600/80 rounded-full p-1.5 text-white"
                            title="Stop user's screen share (mod)"
                            data-testid="mod-screen-off-btn"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="1" y1="1" x2="23" y2="23"/>
                              <rect x="2" y="3" width="20" height="14" rx="2"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Limit-reached modal */}
            {limitNotice && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" data-testid="voice-limit-modal">
                <div className="bg-lc-dark border border-lc-border rounded-xl p-6 max-w-sm mx-4 shadow-2xl">
                  <p className="text-sm text-lc-white mb-4">{limitNotice}</p>
                  <button
                    onClick={() => setLimitNotice(null)}
                    className="lc-pill-primary px-4 py-2 text-sm font-medium w-full"
                    data-testid="voice-limit-dismiss"
                  >
                    OK
                  </button>
                </div>
              </div>
            )}

            {/* Focused view — big main + lateral thumbnails */}
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
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1 min-w-0">
                    {renderVideoTile(focusedPubkey, true)}
                  </div>
                  {videoParticipantsFinal.filter((p: VoiceParticipantView) => p.pubkey !== focusedPubkey).length > 0 && (
                    <div
                      className="flex md:flex-col gap-2 md:gap-3 md:w-48 lg:w-56 md:max-h-[70vh] overflow-x-auto md:overflow-y-auto md:overflow-x-hidden flex-shrink-0"
                      data-testid="focus-thumbnails"
                    >
                      {videoParticipantsFinal
                        .filter((p: VoiceParticipantView) => p.pubkey !== focusedPubkey)
                        .map((p: VoiceParticipantView) => (
                          <div key={p.pubkey} className="w-40 md:w-full flex-shrink-0">
                            {renderVideoTile(p.pubkey, false)}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Video participants grid (non-focused) */}
            {anyVideoActive && !focusedPubkey && (
              <div className="mb-4">
                <div className={`grid gap-3 ${
                  videoParticipantsFinal.length === 1
                    ? 'grid-cols-1 max-w-2xl'
                    : videoParticipantsFinal.length === 2
                      ? 'grid-cols-1 sm:grid-cols-2 max-w-3xl'
                      : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                }`} data-testid="video-grid">
                  {videoParticipantsFinal.map((p: VoiceParticipantView) => renderVideoTile(p.pubkey, false))}
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
                  : (() => {
                      const n = audioOnlyParticipants.length;
                      if (n === 1) return 'grid grid-cols-1 max-w-2xl mx-auto gap-3';
                      if (n === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-3';
                      if (n <= 4) return 'grid grid-cols-2 gap-3';
                      if (n <= 6) return 'grid grid-cols-2 md:grid-cols-3 gap-3';
                      return 'grid grid-cols-3 md:grid-cols-4 gap-3';
                    })()
                }>
                  {audioOnlyParticipants.map((participant: VoiceParticipantView) => {
                    const profile = profileCache.get(participant.pubkey);
                    const name = profile?.name || shortNpub(participant.pubkey);
                    // A muted peer can't legitimately be speaking — belt-and-suspenders
                    // against a detector tick racing the mute state change.
                    const speaking = speakingPubkeys.has(participant.pubkey) && !participant.muted;
                    const locallyMuted = localMutedPubkeys.has(participant.pubkey);
                    const isLocal = participant.pubkey === localPubkey;
                    const toggle = isLocal ? undefined : () => toggleLocalMute(participant.pubkey);

                    if (anyVideoActive) {
                      // Compact badge when videos are active
                      return (
                        <AudioParticipantBadge
                          key={participant.pubkey}
                          pubkey={participant.pubkey}
                          profile={profile}
                          muted={participant.muted}
                          deafened={participant.deafened}
                          speaking={speaking}
                          locallyMuted={locallyMuted}
                          onToggleLocalMute={toggle}
                        />
                      );
                    }

                    // Discord-style large tile layout (no active video) — flat plain bg, no matrix.
                    return (
                      <div
                        key={participant.pubkey}
                        className={`relative aspect-video rounded-xl overflow-hidden transition-all bg-lc-dark ${
                          speaking ? 'ring-2 ring-lc-green' : 'ring-1 ring-lc-border'
                        } ${locallyMuted ? 'opacity-60' : ''}`}
                        data-testid="voice-participant"
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          {profile?.picture ? (
                            <img
                              src={profile.picture}
                              alt={name}
                              className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-black/30 flex items-center justify-center text-lc-white text-2xl font-semibold">
                              {name[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                        </div>
                        {toggle && (
                          <button
                            onClick={toggle}
                            className={`absolute top-2 right-2 p-1.5 rounded-full bg-black/40 backdrop-blur transition-colors ${
                              locallyMuted ? 'text-red-400 hover:text-red-300' : 'text-lc-white/80 hover:text-lc-white'
                            }`}
                            title={locallyMuted ? 'Unmute for me' : 'Mute for me only'}
                            data-testid="local-mute-btn"
                          >
                            <LocalMuteIcon muted={locallyMuted} />
                          </button>
                        )}
                        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur px-2 py-0.5 rounded-md">
                          <span className="text-xs text-lc-white font-medium truncate max-w-[12rem]">{name}</span>
                          {participant.deafened ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="1" y1="1" x2="23" y2="23"/>
                              <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                              <path d="M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                            </svg>
                          ) : participant.muted ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="1" y1="1" x2="23" y2="23"/>
                              <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                            </svg>
                          ) : null}
                        </div>
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
        <div className="relative z-10">
        <VoiceControls
          isMuted={isMuted}
          isDeafened={isDeafened}
          onToggleMute={onToggleMute}
          onToggleDeafen={onToggleDeafen}
          onLeave={onLeave}
          onToggleCamera={onToggleCamera}
          onToggleScreenShare={onToggleScreenShare}
        />
        </div>
      )}
    </div>
    {/* The chat rail is rendered at the page level (chat/page.tsx) so its
        header can align with the outer channel title bar. `chatSlot` here
        just signals the toggle button should appear. */}
    </div>
  );
}
