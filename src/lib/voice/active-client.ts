/**
 * Module-level singleton for the currently-active VoiceClient. Set by
 * VoiceRoom on join, cleared on leave. Anything outside the room (sidebar
 * status bar, hotkeys, etc.) reaches the live call through this.
 */
import type { VoiceClient } from './client';

let active: VoiceClient | null = null;

export function setActiveVoiceClient(client: VoiceClient | null): void {
  active = client;
}

export function getActiveVoiceClient(): VoiceClient | null {
  return active;
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
