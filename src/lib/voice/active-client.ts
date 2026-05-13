/**
 * Module-level singleton for the currently-active VoiceClient. Set by
 * VoiceRoom on join, cleared on leave. Anything outside the room (sidebar
 * status bar, hotkeys, etc.) reaches the live call through this.
 */
import type { VoiceClient } from './client';

let active: VoiceClient | null = null;
const listeners = new Set<(c: VoiceClient | null) => void>();

export function setActiveVoiceClient(client: VoiceClient | null): void {
  active = client;
  if (typeof window !== 'undefined') {
    (window as unknown as { __obeliskActiveVoiceClient?: VoiceClient | null }).__obeliskActiveVoiceClient = client;
  }
  for (const cb of listeners) {
    try { cb(client); } catch { /* swallow — listener errors must not block setActiveVoiceClient */ }
  }
}

export function getActiveVoiceClient(): VoiceClient | null {
  return active;
}

/**
 * Subscribe to active VoiceClient changes. The callback fires immediately
 * with the current value, then again every time `setActiveVoiceClient`
 * runs. Returns an unsubscribe function.
 *
 * Used by `BackgroundVoiceAudio` so the global hidden-audio sink can
 * follow join/leave/channel-switch transitions without owning the
 * `events` callback (which `VoiceRoom` owns when it's mounted).
 */
export function subscribeActiveVoiceClient(cb: (c: VoiceClient | null) => void): () => void {
  listeners.add(cb);
  try { cb(active); } catch { /* swallow */ }
  return () => { listeners.delete(cb); };
}

/**
 * Test/diagnostic accessor — returns the live `RTCPeerConnection.connectionState`
 * for a given remote pubkey, or `null` when there is no live mesh peer for
 * that pubkey. Walks `VoiceClient`'s private `peers` map via the existing
 * `getPeerConnectionState(pubkey)` shim added on the client.
 *
 * Used by the Playwright two-peer mesh spec to assert WebRTC reaches
 * `connected` without instrumenting individual `Peer` instances.
 */
export function getPeerConnectionState(pubkey: string): RTCPeerConnectionState | null {
  const c = active;
  if (!c) return null;
  const fn = (c as unknown as { getPeerConnectionState?: (pk: string) => RTCPeerConnectionState | null }).getPeerConnectionState;
  if (typeof fn !== 'function') return null;
  return fn.call(c, pubkey);
}

// Best-effort: tell the server we're leaving when the tab is being torn
// down, so the SFU's peer state doesn't linger long enough to reject our
// next join. `pagehide` fires for closes, refreshes, and bfcache evictions
// — `beforeunload` is the older event, less reliable on mobile. We
// fire-and-forget; nothing here can `await` because the event loop may
// stop between handlers and the next macrotask.
//
// Server-side this is best-effort only. The SFU MUST also have an
// ICE/DTLS-timeout-driven cleanup so a peer that drops without any
// graceful close (network loss, OS kill, browser crash) eventually frees
// its slot. See docs/sfu-known-bugs.md "Stale peer state on abrupt close".
if (typeof window !== 'undefined') {
  const onUnload = () => {
    const c = active;
    if (!c) return;
    try { void c.leave(); } catch { /* ignore — page is going away */ }
  };
  window.addEventListener('pagehide', onUnload);
  // Defensive — some embedded webviews fire only one of these.
  window.addEventListener('beforeunload', onUnload);
}
