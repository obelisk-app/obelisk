'use client';

/**
 * Voice channel room. Owns one VoiceClient and renders a stage layout:
 *  - When someone is sharing screen, the share takes the canvas and cams
 *    collapse to a side rail (desktop) / horizontal strip (mobile).
 *  - Otherwise, video tiles fill the canvas in a responsive grid.
 *  - Audio-only participants show as a compact horizontal strip.
 *  - A floating control pill sits over the stage.
 *
 * Authorization: subscribes to NIP-29 admins (39001) and members (39002).
 *
 * Background-call wiring: on join we register the client in the active-client
 * singleton and mirror local-track / connection state into `useVoiceStore`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VoiceClient, type RemoteTrack } from '@/lib/voice/client';
import { setActiveVoiceClient, getActiveVoiceClient } from '@/lib/voice/active-client';
import { getBridge } from '@/lib/nostr-bridge/client';
import type { NostrBridge } from '@/lib/nostr-bridge/types';
import { useVoiceStore } from '@/store/voice';
import { useUserMetadata } from '@/lib/nostr-bridge';
import VoiceControls from './VoiceControls';
import ShootingStars from '@/components/ShootingStars';
import { qualityColor, type QualitySample } from '@/lib/voice/stats';
import { toggleFullscreen, useFullscreenState } from './fullscreen';

interface Props {
  channelId: string;
  channelName?: string;
  chatSlot?: React.ReactNode;
  isChatOpen?: boolean;
  onToggleChat?: () => void;
}

type AuthGate =
  | { phase: 'init' }
  | { phase: 'loading-roles' }
  | { phase: 'not-a-member' }
  | { phase: 'ready'; members: readonly string[]; admins: readonly string[]; open: boolean };

export default function VoiceRoom({ channelId, channelName, chatSlot, isChatOpen, onToggleChat }: Props) {
  const router = useRouter();
  const clientRef = useRef<VoiceClient | null>(null);
  const [gate, setGate] = useState<AuthGate>({ phase: 'init' });
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [local, setLocal] = useState<{ mic: boolean; camera: boolean; screen: boolean }>({ mic: false, camera: false, screen: false });
  const [selfPubkey, setSelfPubkey] = useState<string>('');
  // Pinned participant — when set, that person's screen (preferred) or camera
  // takes the main stage and everyone else collapses to the rail. Any user can
  // pin/unpin from any tile.
  const [pinned, setPinned] = useState<string | null>(null);
  const [joined, setJoined] = useState<boolean>(() => {
    const c = getActiveVoiceClient();
    return !!(c && c.channelId === channelId && c.isJoined());
  });

  // Phase 1 — bridge + role subscriptions, gate decision.
  useEffect(() => {
    let cancelled = false;
    let bridgeRef: NostrBridge | null = null;
    let unsubMembers: (() => void) | null = null;
    let unsubAdmins: (() => void) | null = null;
    let unsubReady: (() => void) | null = null;

    let latestMembers: readonly string[] = [];
    let latestAdmins: readonly string[] = [];
    let membershipReady = false;
    let isOpen = false;
    let unsubGroups: (() => void) | null = null;
    let resolveTimer: ReturnType<typeof setTimeout> | null = null;

    setGate({ phase: 'loading-roles' });

    (async () => {
      try {
        const bridge = await getBridge();
        if (cancelled) return;
        bridgeRef = bridge;
        const pk = bridge.getPublicKey();
        if (!pk) {
          setError('You must be logged in to join voice.');
          return;
        }
        setSelfPubkey(pk);

        const decide = () => {
          if (cancelled) return;
          // Push live state into the running client. setOpen is critical:
          // if the channel's `["open"]` flag arrives after the client was
          // constructed, without this the local user sees nobody but
          // themselves because subscribeRoster's filter drops every remote
          // pubkey that isn't in the (still-empty) member set.
          clientRef.current?.setOpen(isOpen);
          clientRef.current?.updateRoles(latestMembers, latestAdmins);
          // Open channels (NIP-29 `["open"]` tag on kind 39000) admit
          // anyone — gating those on member/admin presence forces the
          // "not a member" screen for users who joined via the open flow
          // without an explicit kind 9000 ever landing on this relay.
          if (isOpen || latestMembers.includes(pk) || latestAdmins.includes(pk)) {
            setGate({ phase: 'ready', members: latestMembers, admins: latestAdmins, open: isOpen });
          } else {
            setGate({ phase: 'not-a-member' });
          }
        };

        // Resolve immediately on a positive match (or open channel).
        // Otherwise wait for the bridge's "membership ready" signal —
        // flipped to true the first time the relay delivers a 39001 or
        // 39002 event for this group. Without that signal, an empty list
        // could mean "not loaded yet" (slow NIP-42 round-trip) just as
        // easily as "user is not a member", and falsely flipping to
        // "not-a-member" is what forces the refresh-loop UX.
        const tryResolve = () => {
          if (cancelled) return;
          if (isOpen || latestMembers.includes(pk) || latestAdmins.includes(pk)) {
            decide();
            return;
          }
          if (membershipReady) decide();
        };

        unsubGroups = bridge.subscribeGroups((groups) => {
          const next = groups.find((g) => g.id === channelId)?.isOpen ?? false;
          if (next === isOpen) return;
          isOpen = next;
          tryResolve();
        });
        unsubMembers = bridge.subscribeMembers(channelId, (members) => {
          latestMembers = members;
          tryResolve();
        });
        unsubAdmins = bridge.subscribeAdmins(channelId, (admins) => {
          latestAdmins = admins;
          tryResolve();
        });
        unsubReady = bridge.subscribeMembershipReady(channelId, (ready) => {
          membershipReady = ready;
          tryResolve();
        });

        // Hard ceiling: if nothing came back at all after 12s, surface an
        // error so the user isn't stuck on a silent spinner.
        resolveTimer = setTimeout(() => {
          if (cancelled) return;
          if (!membershipReady) {
            setError('Could not load channel membership. Is this a valid channel id?');
          }
        }, 12000);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setError(msg);
      }
    })();

    return () => {
      cancelled = true;
      if (resolveTimer) clearTimeout(resolveTimer);
      unsubGroups?.();
      unsubMembers?.();
      unsubAdmins?.();
      unsubReady?.();
      void bridgeRef;
    };
  }, [channelId]);

  // Phase 2 — once gated AND joined, attach to/start the call.
  useEffect(() => {
    if (gate.phase !== 'ready') return;
    if (!joined) return;
    let cancelled = false;
    const store = useVoiceStore.getState();
    store.setError(null);

    const events = {
      onParticipantsChange: (p: string[]) => { if (!cancelled) setParticipants(p); },
      onRemoteTracksChange: (t: RemoteTrack[]) => { if (!cancelled) setRemoteTracks(t); },
      onLocalTracksChange: (l: { mic: boolean; camera: boolean; screen: boolean }) => {
        if (cancelled) return;
        setLocal(l);
        const s = useVoiceStore.getState();
        s.setMuted(!l.mic);
        s.setCameraOn(l.camera);
        s.setScreenSharing(l.screen);
      },
      onError: (m: string) => {
        if (cancelled) return;
        setError(m);
        useVoiceStore.getState().setError(m);
      },
    };

    const existing = getActiveVoiceClient();
    if (existing && existing.channelId === channelId && existing.isJoined()) {
      existing.setEvents(events);
      clientRef.current = existing;
      setParticipants(existing.getParticipants());
      setRemoteTracks(existing.getRemoteTracks());
      const tracks = existing.getLocalTracks();
      const localState = { mic: !!tracks.mic, camera: !!tracks.camera, screen: !!tracks.screen };
      setLocal(localState);
      const s = useVoiceStore.getState();
      s.setMuted(!localState.mic);
      s.setCameraOn(localState.camera);
      s.setScreenSharing(localState.screen);
      s.setVoiceChannel(channelId);
      s.setConnecting(false);
      return () => {
        cancelled = true;
        if (clientRef.current === existing) {
          existing.setEvents({});
          clientRef.current = null;
        }
      };
    }

    if (existing && existing.channelId !== channelId) {
      void existing.leave();
      setActiveVoiceClient(null);
    }

    store.setConnecting(true);
    let client: VoiceClient | null = null;

    (async () => {
      try {
        client = new VoiceClient(channelId, { members: gate.members, admins: gate.admins, open: gate.open, events });
        clientRef.current = client;
        setActiveVoiceClient(client);
        await client.join();
        if (cancelled) return;
        const s = useVoiceStore.getState();
        s.setVoiceChannel(channelId);
        s.setConnecting(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) {
          setError(msg);
          useVoiceStore.getState().setError(msg);
          useVoiceStore.getState().setConnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.setEvents({});
        clientRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.phase, channelId, joined]);

  const leave = useCallback(async () => {
    const c = clientRef.current ?? getActiveVoiceClient();
    clientRef.current = null;
    if (c) await c.leave();
    setActiveVoiceClient(null);
    useVoiceStore.getState().leaveVoice();
    setJoined(false);
    setParticipants([]);
    setRemoteTracks([]);
    setLocal({ mic: false, camera: false, screen: false });
  }, []);

  // Mirror externally-driven hangups (e.g. the VoiceStatusBar leave button)
  // back into local state so the room flips to the "Join voice channel"
  // landing instead of staying on a stale connected view.
  useEffect(() => {
    const unsub = useVoiceStore.subscribe((state, prev) => {
      if (prev.currentVoiceChannelId === channelId && state.currentVoiceChannelId !== channelId) {
        clientRef.current = null;
        setJoined(false);
        setParticipants([]);
        setRemoteTracks([]);
        setLocal({ mic: false, camera: false, screen: false });
      }
    });
    return unsub;
  }, [channelId]);

  const tracksByPubkey = useMemo(() => {
    const m = new Map<string, { audio?: RemoteTrack; camera?: RemoteTrack; screen?: RemoteTrack; screenAudio?: RemoteTrack }>();
    for (const t of remoteTracks) {
      const slot = m.get(t.pubkey) ?? {};
      if (t.kind === 'audio') slot.audio = t;
      else if (t.kind === 'camera') slot.camera = t;
      else if (t.kind === 'screen') slot.screen = t;
      else if (t.kind === 'screen-audio') slot.screenAudio = t;
      m.set(t.pubkey, slot);
    }
    return m;
  }, [remoteTracks]);

  const localCamStream = useMemo(() => {
    const cam = clientRef.current?.getLocalTracks().camera ?? null;
    return cam ? new MediaStream([cam]) : null;
  }, [local.camera]);
  const localScreenStream = useMemo(() => {
    const s = clientRef.current?.getLocalTracks().screen ?? null;
    return s ? new MediaStream([s]) : null;
  }, [local.screen]);

  const videoPubkeys: string[] = [];
  const audioPubkeys: string[] = [];
  if (local.camera) videoPubkeys.push(selfPubkey);
  else audioPubkeys.push(selfPubkey);
  for (const pk of participants) {
    if (tracksByPubkey.get(pk)?.camera) videoPubkeys.push(pk);
    else audioPubkeys.push(pk);
  }

  const screenSharers: { pubkey: string; track: RemoteTrack | null; isLocal: boolean }[] = [];
  if (local.screen && localScreenStream) screenSharers.push({ pubkey: selfPubkey, track: null, isLocal: true });
  for (const pk of participants) {
    const s = tracksByPubkey.get(pk)?.screen;
    if (s) screenSharers.push({ pubkey: pk, track: s, isLocal: false });
  }

  // Resolve the stage:
  //   - If user pinned someone, show their screen (preferred) or camera.
  //   - Else, if anyone is screen-sharing, default to first sharer.
  //   - Else no stage → grid mode.
  const activeStage = useMemo<
    | { pubkey: string; isLocal: boolean; kind: 'screen' | 'camera'; videoStream: MediaStream | null; audioStream: MediaStream | null }
    | null
  >(() => {
    const build = (pk: string): { pubkey: string; isLocal: boolean; kind: 'screen' | 'camera'; videoStream: MediaStream | null; audioStream: MediaStream | null } | null => {
      const isLocal = pk === selfPubkey;
      const slot = tracksByPubkey.get(pk);
      const hasScreen = isLocal ? !!localScreenStream : !!slot?.screen;
      if (hasScreen) {
        return {
          pubkey: pk,
          isLocal,
          kind: 'screen',
          videoStream: isLocal ? localScreenStream : (slot?.screen?.stream ?? null),
          audioStream: isLocal ? null : (slot?.screenAudio?.stream ?? null),
        };
      }
      const hasCam = isLocal ? !!localCamStream : !!slot?.camera;
      if (hasCam) {
        return {
          pubkey: pk,
          isLocal,
          kind: 'camera',
          videoStream: isLocal ? localCamStream : (slot?.camera?.stream ?? null),
          audioStream: isLocal ? null : (slot?.audio?.stream ?? null),
        };
      }
      return null;
    };

    if (pinned) {
      const s = build(pinned);
      if (s) return s;
    }
    if (screenSharers.length > 0) {
      const first = screenSharers[0];
      return {
        pubkey: first.pubkey,
        isLocal: first.isLocal,
        kind: 'screen',
        videoStream: first.isLocal ? localScreenStream : (first.track?.stream ?? null),
        audioStream: first.isLocal ? null : (tracksByPubkey.get(first.pubkey)?.screenAudio?.stream ?? null),
      };
    }
    return null;
  }, [pinned, screenSharers, tracksByPubkey, selfPubkey, localCamStream, localScreenStream]);

  if (gate.phase === 'init' || gate.phase === 'loading-roles') {
    return (
      <CenteredPanel>
        <Spinner />
        <div className="mt-3 text-sm text-neutral-300">Loading channel membership…</div>
        <div className="mt-1 font-mono text-xs text-neutral-500 break-all">{channelId}</div>
        {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
      </CenteredPanel>
    );
  }
  if (gate.phase === 'not-a-member') {
    return (
      <CenteredPanel>
        <div className="text-lg font-semibold">You aren&apos;t a member of this channel.</div>
        <div className="mt-2 text-sm text-neutral-400">Ask an admin to add you, then refresh this page.</div>
        <div className="mt-4 font-mono text-xs text-neutral-500 break-all">{channelId}</div>
        <button
          onClick={() => router.push('/app')}
          className="mt-6 px-4 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-sm"
        >
          Back
        </button>
      </CenteredPanel>
    );
  }

  const totalCount = participants.length + 1;
  const displayName = channelName ?? `${channelId.slice(0, 16)}…`;

  if (!joined) {
    return (
      <div className="relative flex-1 flex min-h-0 p-2 sm:p-3 gap-2" data-testid="voice-channel">
        <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden rounded-2xl border border-lc-border bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 shadow-2xl">
          <StageBackdrop />
          <RoomHeader name={displayName} count={0} />
          <div className="relative z-10 flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-sm">
              <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-lc-green/10 ring-1 ring-lc-green/30 flex items-center justify-center text-lc-green">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </div>
              <div className="text-xl font-semibold text-lc-white mb-1">{displayName}</div>
              <div className="text-sm text-lc-muted mb-6">No one&apos;s here yet. Be the first to join.</div>
              <button
                onClick={() => setJoined(true)}
                className="bg-lc-green hover:bg-lc-green/90 text-lc-black px-6 py-2.5 rounded-full text-sm font-semibold transition-colors shadow-lg shadow-lc-green/20"
                data-testid="join-voice-btn"
              >
                Join voice channel
              </button>
              {error && <div className="mt-4 text-xs text-red-300">{error}</div>}
            </div>
          </div>
        </div>
        {chatSlot && isChatOpen && (
          <div className="contents max-md:!block max-md:absolute max-md:inset-0 max-md:z-30 max-md:bg-lc-black/80 max-md:backdrop-blur-sm">
            {chatSlot}
          </div>
        )}
      </div>
    );
  }

  const hasStage = !!activeStage;

  return (
    <div className="relative flex-1 flex min-h-0 p-2 sm:p-3 gap-2" data-testid="voice-channel">
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden rounded-2xl border border-lc-border bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 shadow-2xl">
        <StageBackdrop />
        <RoomHeader name={displayName} count={totalCount} />

        {/* Stage area */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col md:flex-row gap-2 sm:gap-3 p-2 sm:p-3 pb-24 sm:pb-28 overflow-hidden">
          {hasStage ? (
            <>
              {/* Main stage */}
              <div className="flex-1 min-h-0 min-w-0 flex flex-col">
                <Stage
                  pubkey={activeStage!.pubkey}
                  isLocal={activeStage!.isLocal}
                  kind={activeStage!.kind}
                  videoStream={activeStage!.videoStream}
                  audioStream={activeStage!.audioStream}
                  pinned={pinned === activeStage!.pubkey}
                  onTogglePin={() => setPinned((p) => (p === activeStage!.pubkey ? null : activeStage!.pubkey))}
                />
              </div>

              {/* Side rail (desktop) / bottom strip (mobile) — everyone, click to pin */}
              <aside className="md:w-56 lg:w-64 shrink-0 flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto pb-1 md:pb-0">
                {videoPubkeys.map((pk) => (
                  <RailVideoTile
                    key={pk}
                    pubkey={pk}
                    isLocal={pk === selfPubkey}
                    videoStream={pk === selfPubkey ? localCamStream : (tracksByPubkey.get(pk)?.camera?.stream ?? null)}
                    audioStream={pk === selfPubkey ? null : (tracksByPubkey.get(pk)?.audio?.stream ?? null)}
                    isPinned={pinned === pk}
                    isStage={activeStage!.pubkey === pk}
                    onClick={() => setPinned((p) => (p === pk ? null : pk))}
                  />
                ))}
                {audioPubkeys.map((pk) => (
                  <RailAudioTile
                    key={pk}
                    pubkey={pk}
                    isLocal={pk === selfPubkey}
                    audioStream={pk === selfPubkey ? null : (tracksByPubkey.get(pk)?.audio?.stream ?? null)}
                  />
                ))}
              </aside>
            </>
          ) : (
            /* No screen-share: tiled video grid + audio strip */
            <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
              {videoPubkeys.length > 0 && (
                <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center" data-testid="video-grid">
                  {videoPubkeys.length === 1 ? (
                    <div className="max-w-full max-h-full aspect-video w-auto h-full">
                      <VideoTile
                        pubkey={videoPubkeys[0]}
                        isLocal={videoPubkeys[0] === selfPubkey}
                        videoStream={videoPubkeys[0] === selfPubkey ? localCamStream : (tracksByPubkey.get(videoPubkeys[0])?.camera?.stream ?? null)}
                        audioStream={videoPubkeys[0] === selfPubkey ? null : (tracksByPubkey.get(videoPubkeys[0])?.audio?.stream ?? null)}
                        onPin={() => setPinned(videoPubkeys[0])}
                        fit="contain"
                        fillParent
                      />
                    </div>
                  ) : (
                    <div
                      className={
                        'grid gap-2 sm:gap-3 w-full h-full content-center ' +
                        (videoPubkeys.length === 2
                          ? 'grid-cols-1 sm:grid-cols-2'
                          : videoPubkeys.length <= 4
                            ? 'grid-cols-2'
                            : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4')
                      }
                    >
                      {videoPubkeys.map((pk) => (
                        <VideoTile
                          key={pk}
                          pubkey={pk}
                          isLocal={pk === selfPubkey}
                          videoStream={pk === selfPubkey ? localCamStream : (tracksByPubkey.get(pk)?.camera?.stream ?? null)}
                          audioStream={pk === selfPubkey ? null : (tracksByPubkey.get(pk)?.audio?.stream ?? null)}
                          onPin={() => setPinned(pk)}
                          fit="cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {audioPubkeys.length > 0 && videoPubkeys.length === 0 && (
                <div className="flex-1 min-h-0 flex items-center justify-center" data-testid="audio-participants">
                  <div
                    className={
                      'grid gap-3 sm:gap-4 ' +
                      (audioPubkeys.length === 1
                        ? 'grid-cols-1'
                        : audioPubkeys.length === 2
                          ? 'grid-cols-2'
                          : audioPubkeys.length <= 4
                            ? 'grid-cols-2 sm:grid-cols-2'
                            : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4')
                    }
                  >
                    {audioPubkeys.map((pk) => (
                      <AudioTile
                        key={pk}
                        pubkey={pk}
                        isLocal={pk === selfPubkey}
                        audioStream={pk === selfPubkey ? null : (tracksByPubkey.get(pk)?.audio?.stream ?? null)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {audioPubkeys.length > 0 && videoPubkeys.length > 0 && (
                <div className="shrink-0 flex gap-2 overflow-x-auto pb-1" data-testid="audio-participants">
                  {audioPubkeys.map((pk) => (
                    <AudioChip
                      key={pk}
                      pubkey={pk}
                      isLocal={pk === selfPubkey}
                      audioStream={pk === selfPubkey ? null : (tracksByPubkey.get(pk)?.audio?.stream ?? null)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Floating control pill */}
        <div className="absolute left-0 right-0 bottom-3 sm:bottom-4 z-20 flex justify-center pointer-events-none px-2">
          <VoiceControls onLeave={leave} isChatOpen={isChatOpen} onToggleChat={onToggleChat} />
        </div>
      </div>

      {chatSlot && isChatOpen && chatSlot}
    </div>
  );
}

// ---- Sub-components ------------------------------------------------------

function StageBackdrop() {
  return (
    <>
      {/* Matrix grid overlay — restored from the legacy VoiceChannel look. */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        aria-hidden
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
        <ShootingStars contained count={8} />
      </div>
      <div
        className="absolute inset-0 z-0 opacity-60 pointer-events-none"
        aria-hidden
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(180,249,83,0.05), transparent 70%), radial-gradient(50% 40% at 100% 100%, rgba(99,102,241,0.10), transparent 70%)',
        }}
      />
    </>
  );
}

function RoomHeader({ name, count }: { name: string; count: number }) {
  return (
    <div className="relative z-10 px-3 sm:px-5 py-3 flex items-center justify-between border-b border-white/5">
      <div className="min-w-0 flex items-center gap-2.5">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lc-green opacity-50" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-lc-green" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.14em] text-lc-muted leading-none mb-1">Voice channel</div>
          <div className="font-semibold text-lc-white truncate text-sm sm:text-base leading-tight">{name}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/80">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span className="tabular-nums">{count}</span>
      </div>
    </div>
  );
}

function Stage({ pubkey, isLocal, kind, videoStream, audioStream, pinned, onTogglePin }: {
  pubkey: string;
  isLocal: boolean;
  kind: 'screen' | 'camera';
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const meta = useUserMetadata(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // The fullscreen target wraps both the <video> and the <audio>: making
  // just the <video> fullscreen detaches its sibling audio from the focus
  // surface and Safari has been observed to mute it. Wrapping both keeps
  // audio playing through the transition.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isMutedForMe = useTileAudioMuted(pubkey);
  const speaking = useTileSpeaking(pubkey);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = videoStream;
    if (videoStream) void el.play().catch(() => {});
  }, [videoStream]);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.srcObject = audioStream;
    if (audioStream) void el.play().catch(() => {});
  }, [audioStream]);
  const label =
    kind === 'screen'
      ? isLocal ? 'You are presenting' : `${name} is presenting`
      : isLocal ? `You · ${name}` : name;
  return (
    <div
      ref={containerRef}
      className={
        'relative flex-1 min-h-0 rounded-xl overflow-hidden bg-black ring-1 ring-white/10 transition-shadow ' +
        (speaking ? 'ring-2 ring-lc-green shadow-[0_0_24px_rgba(180,249,83,0.4)]' : '')
      }
      data-testid={kind === 'screen' ? 'screen-share-area' : 'video-stage'}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={'w-full h-full object-contain ' + (kind === 'camera' && isLocal ? 'scale-x-[-1]' : '')}
      />
      {!isLocal && <audio ref={audioRef} autoPlay muted={isMutedForMe} />}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/60 backdrop-blur text-[11px] text-lc-green border border-lc-green/30">
        <span className="font-medium">{label}</span>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {!isLocal && <MuteForMeButton pubkey={pubkey} />}
        <FullscreenButton targetRef={containerRef} />
        <button
          type="button"
          onClick={onTogglePin}
          title={pinned ? 'Unpin' : 'Pin to stage'}
          className={
            'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] backdrop-blur transition-colors ' +
            (pinned
              ? 'bg-lc-green/20 text-lc-green border border-lc-green/40'
              : 'bg-black/60 text-white/80 border border-white/15 hover:bg-black/80')
          }
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5" />
            <path d="M9 10.76V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4.76a2 2 0 0 0 .55 1.39l1.65 1.7A1 1 0 0 1 16.5 15.5h-9A1 1 0 0 1 6.8 13.85l1.65-1.7A2 2 0 0 0 9 10.76z" />
          </svg>
          {pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>
    </div>
  );
}

function VideoTile({ pubkey, isLocal, videoStream, audioStream, onPin, fit = 'cover', fillParent = false }: {
  pubkey: string;
  isLocal: boolean;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  onPin?: () => void;
  fit?: 'cover' | 'contain';
  fillParent?: boolean;
}) {
  const meta = useUserMetadata(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isMutedForMe = useTileAudioMuted(pubkey);
  const speaking = useTileSpeaking(pubkey);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = videoStream;
    if (videoStream) el.play().catch(() => {});
  }, [videoStream]);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.srcObject = audioStream;
    if (audioStream) el.play().catch(() => {});
  }, [audioStream]);

  const fitClass = fit === 'contain' ? 'object-contain bg-black' : 'object-cover';
  // Use a div with role=button so we can host nested controls (mute,
  // fullscreen) — nested <button>s are invalid HTML.
  return (
    <div
      ref={containerRef}
      role={onPin ? 'button' : undefined}
      tabIndex={onPin ? 0 : undefined}
      onClick={onPin}
      onKeyDown={(e) => {
        if (!onPin) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPin(); }
      }}
      className={
        'relative rounded-xl overflow-hidden ring-1 ring-white/10 bg-neutral-950 group text-left transition ' +
        (onPin ? 'cursor-pointer hover:ring-lc-green/40 ' : '') +
        (speaking ? 'ring-2 ring-lc-green ' : '') +
        (fillParent ? 'w-full h-full' : 'w-full aspect-video')
      }
      data-testid="video-tile"
      title={onPin ? 'Pin to stage' : undefined}
    >
      {videoStream ? (
        <video ref={videoRef} autoPlay playsInline muted={isLocal} className={`w-full h-full ${fitClass} ${isLocal ? 'scale-x-[-1]' : ''}`} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Avatar pubkey={pubkey} picture={meta?.picture} name={name} size={20} speaking={speaking} />
        </div>
      )}
      {!isLocal && <audio ref={audioRef} autoPlay muted={isMutedForMe} />}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {!isLocal && <MuteForMeButton pubkey={pubkey} />}
        {videoStream && <FullscreenButton targetRef={containerRef} />}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-1.5 flex items-center gap-1.5">
        {!isLocal && <QualityDot pubkey={pubkey} />}
        <span className="text-xs text-white font-medium truncate">{isLocal ? `You · ${name}` : name}</span>
      </div>
    </div>
  );
}

function QualityDot({ pubkey }: { pubkey: string }) {
  const sample = useVoiceStore((s) => s.peerQuality[pubkey]) as QualitySample | undefined;
  const color = qualityColor(sample?.level ?? 'unknown');
  const tooltip = sample
    ? [
        sample.outboundVideoBps != null ? `${Math.round(sample.outboundVideoBps / 1000)} kbps↑` : null,
        sample.rttMs != null ? `${Math.round(sample.rttMs)} ms RTT` : null,
        sample.loss != null ? `${(sample.loss * 100).toFixed(1)}% loss` : null,
      ].filter(Boolean).join(' · ')
    : 'Connecting…';
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      title={`${sample?.level ?? 'unknown'} — ${tooltip}`}
      data-testid="peer-quality-dot"
      data-quality={sample?.level ?? 'unknown'}
    />
  );
}

function RailVideoTile({ isPinned, isStage, onClick, ...props }: {
  pubkey: string;
  isLocal: boolean;
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  isPinned?: boolean;
  isStage?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={
        'shrink-0 w-40 md:w-full md:max-w-full ' +
        (isStage ? 'ring-2 ring-lc-green rounded-xl' : '') +
        (isPinned ? ' opacity-90' : '')
      }
    >
      <VideoTile {...props} onPin={onClick} />
    </div>
  );
}

function AudioTile({ pubkey, isLocal, audioStream }: {
  pubkey: string;
  isLocal: boolean;
  audioStream: MediaStream | null;
}) {
  const meta = useUserMetadata(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedForMe = useTileAudioMuted(pubkey);
  const speaking = useTileSpeaking(pubkey);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.srcObject = audioStream;
    if (audioStream) el.play().catch(() => {});
  }, [audioStream, pubkey]);
  return (
    <div
      className={
        'relative aspect-video sm:aspect-square w-44 sm:w-48 rounded-2xl overflow-hidden bg-gradient-to-br from-neutral-900 to-neutral-950 flex flex-col items-center justify-center p-3 transition-shadow group ' +
        (speaking ? 'ring-2 ring-lc-green shadow-[0_0_18px_rgba(180,249,83,0.35)]' : 'ring-1 ring-white/10')
      }
      data-testid="voice-participant"
    >
      <div className={'rounded-full p-1 ' + (isLocal ? 'ring-2 ring-lc-green' : 'ring-1 ring-white/10')}>
        <Avatar pubkey={pubkey} picture={meta?.picture} name={name} size={16} speaking={speaking} />
      </div>
      <div className="mt-2 text-xs text-white font-medium truncate max-w-full flex items-center gap-1.5">
        {!isLocal && <QualityDot pubkey={pubkey} />}
        <span className="truncate">{isLocal ? `You · ${name}` : name}</span>
      </div>
      {!isLocal && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <MuteForMeButton pubkey={pubkey} />
        </div>
      )}
      {!isLocal && <audio ref={audioRef} autoPlay muted={isMutedForMe} />}
    </div>
  );
}

function RailAudioTile({ pubkey, isLocal, audioStream }: {
  pubkey: string;
  isLocal: boolean;
  audioStream: MediaStream | null;
}) {
  const meta = useUserMetadata(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedForMe = useTileAudioMuted(pubkey);
  const speaking = useTileSpeaking(pubkey);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.srcObject = audioStream;
    if (audioStream) el.play().catch(() => {});
  }, [audioStream, pubkey]);
  return (
    <div
      className={
        'relative shrink-0 w-40 md:w-full aspect-video rounded-xl bg-neutral-900 flex flex-col items-center justify-center gap-1.5 p-2 group transition-shadow ' +
        (speaking ? 'ring-2 ring-lc-green' : 'ring-1 ring-white/10')
      }
      data-testid="voice-participant"
    >
      <Avatar pubkey={pubkey} picture={meta?.picture} name={name} size={10} speaking={speaking} />
      <span className="text-[11px] text-white/85 truncate max-w-full px-1">{isLocal ? `You · ${name}` : name}</span>
      {!isLocal && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <MuteForMeButton pubkey={pubkey} compact />
        </div>
      )}
      {!isLocal && <audio ref={audioRef} autoPlay muted={isMutedForMe} />}
    </div>
  );
}

function AudioChip({ pubkey, isLocal, audioStream }: {
  pubkey: string;
  isLocal: boolean;
  audioStream: MediaStream | null;
}) {
  const meta = useUserMetadata(pubkey);
  const name = meta?.displayName || meta?.name || pubkey.slice(0, 8);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMutedForMe = useTileAudioMuted(pubkey);
  const speaking = useTileSpeaking(pubkey);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.srcObject = audioStream;
    if (audioStream) el.play().catch(() => {});
  }, [audioStream, pubkey]);
  return (
    <div
      className={
        'shrink-0 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/5 transition-shadow ' +
        (speaking ? 'ring-2 ring-lc-green' : 'ring-1 ring-white/10')
      }
      data-testid="voice-participant"
    >
      <Avatar pubkey={pubkey} picture={meta?.picture} name={name} size={6} speaking={speaking} />
      <span className="text-xs text-white/85 truncate max-w-[10rem]">{isLocal ? `You · ${name}` : name}</span>
      {!isLocal && <MuteForMeButton pubkey={pubkey} compact />}
      {!isLocal && <audio ref={audioRef} autoPlay muted={isMutedForMe} />}
    </div>
  );
}

function Avatar({ pubkey, picture, name, size, speaking = false }: { pubkey: string; picture?: string | null; name: string; size: number; speaking?: boolean }) {
  const px = `${size * 4}px`;
  const speakingClass = speaking ? ' shadow-[0_0_12px_rgba(180,249,83,0.55)]' : '';
  if (picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={picture} alt={name} className={'rounded-full object-cover' + speakingClass} style={{ width: px, height: px }} />;
  }
  return (
    <div
      className={'rounded-full bg-gradient-to-br from-lc-olive to-neutral-800 flex items-center justify-center text-lc-green font-semibold ring-1 ring-white/10' + speakingClass}
      style={{ width: px, height: px, fontSize: `${Math.max(12, size * 1.4)}px` }}
    >
      {(name[0] ?? pubkey[0])?.toUpperCase()}
    </div>
  );
}

// ── Hooks: speaking, per-peer mute ─────────────────────────────────────

function useTileSpeaking(pubkey: string): boolean {
  return useVoiceStore((s) => !!s.speakingPubkeys[pubkey]);
}

/** Combined "this tile's audio should be muted right now" — true when the
 *  user has deafened OR has muted-for-me'd this specific peer. */
function useTileAudioMuted(pubkey: string): boolean {
  return useVoiceStore((s) => s.isDeafened || !!s.localMutedPubkeys[pubkey]);
}

// ── UI atoms: mute-for-me, fullscreen ──────────────────────────────────

function MuteForMeButton({ pubkey, compact = false }: { pubkey: string; compact?: boolean }) {
  const muted = useVoiceStore((s) => !!s.localMutedPubkeys[pubkey]);
  const muteLocally = useVoiceStore((s) => s.muteLocally);
  const unmuteLocally = useVoiceStore((s) => s.unmuteLocally);
  return (
    <button
      type="button"
      onClick={(e) => {
        // Stops the click bubbling to the tile's pin handler.
        e.stopPropagation();
        if (muted) unmuteLocally(pubkey);
        else muteLocally(pubkey);
      }}
      title={muted ? 'Unmute (just for you)' : 'Mute for me only'}
      data-testid="mute-for-me"
      data-muted={muted}
      className={
        'flex items-center justify-center rounded-md backdrop-blur transition-colors ' +
        (compact ? 'w-6 h-6 ' : 'px-2 py-1 ') +
        (muted
          ? 'bg-red-500/20 text-red-300 border border-red-400/40'
          : 'bg-black/60 text-white/80 border border-white/15 hover:bg-black/80')
      }
    >
      <svg width={compact ? 12 : 11} height={compact ? 12 : 11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {muted ? (
          <>
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
            <path d="M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </>
        ) : (
          <>
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </>
        )}
      </svg>
    </button>
  );
}

function FullscreenButton({ targetRef }: { targetRef: { current: HTMLElement | null } }) {
  const isFullscreen = useFullscreenState(targetRef);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggleFullscreen(targetRef.current);
      }}
      title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      data-testid="fullscreen-toggle"
      data-fullscreen={isFullscreen}
      className={
        'flex items-center justify-center w-7 h-7 rounded-md backdrop-blur transition-colors ' +
        (isFullscreen
          ? 'bg-lc-green/20 text-lc-green border border-lc-green/40'
          : 'bg-black/60 text-white/80 border border-white/15 hover:bg-black/80')
      }
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isFullscreen ? (
          <>
            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
          </>
        ) : (
          <>
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </>
        )}
      </svg>
    </button>
  );
}

function CenteredPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-black text-white p-6">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center">
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="w-6 h-6 border-2 border-neutral-700 border-t-lc-green rounded-full animate-spin mx-auto" aria-label="loading" />;
}
