/**
 * Navigation hand-off between the always-mounted VoiceStatusBar and the
 * AppShell's `setView`. The status bar can't reach `setView` (different
 * subtree) so we go through a tiny pub/sub: status bar dispatches a request,
 * AppShell subscribes and decides whether to switch relays first and then
 * set the view to the call's channel.
 *
 * Kept narrow on purpose — adding an entire navigation store for one
 * cross-tree handoff would be overkill. If a second handoff appears, fold
 * both into a real store.
 */

export interface VoiceJumpRequest {
  channelId: string;
  /** Relay URL captured at join time. `null` when the call started before
   *  this field was added — caller stays on the current relay in that case. */
  relayUrl: string | null;
}

type Listener = (req: VoiceJumpRequest) => void;
const listeners = new Set<Listener>();

export function requestVoiceJump(req: VoiceJumpRequest): void {
  for (const l of listeners) {
    try { l(req); } catch (err) { console.warn('[voice] jump listener threw', err); }
  }
}

export function subscribeVoiceJump(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
