/**
 * Same-browser multi-tab sync for read-state via `BroadcastChannel`.
 *
 * When a tab clears a channel or DM unread, it posts a message on the
 * `obelisk:unreads` channel; sibling tabs subscribe and mirror the clear
 * into their own notification store. This handles scenario 11 (two tabs
 * as the same user — mention badges both, reading in one clears both)
 * without any server round-trip for the common case.
 *
 * Cross-device sync is handled separately by the Socket.io `read-update` /
 * `dm-read-update` events emitted from `server.ts`.
 *
 * **Pubkey scoping:** every payload carries the sender's `senderPubkey`.
 * Subscribers MUST compare it to their own logged-in pubkey and drop
 * mismatching messages — otherwise a second tab logged in as a DIFFERENT
 * user on the same browser would see its unreads falsely cleared.
 *
 * SSR-guarded: every export is a no-op when `BroadcastChannel` is missing
 * (e.g. during build-time rendering or very old browsers).
 */

export type BroadcastMessage =
  | { kind: 'clear-channel'; senderPubkey: string; channelId: string }
  | { kind: 'clear-dm'; senderPubkey: string; pubkey: string };

const CHANNEL_NAME = 'obelisk:unreads';

function hasBroadcastChannel(): boolean {
  return typeof globalThis !== 'undefined' && typeof (globalThis as any).BroadcastChannel !== 'undefined';
}

let channelInstance: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (!hasBroadcastChannel()) return null;
  if (!channelInstance) {
    channelInstance = new BroadcastChannel(CHANNEL_NAME);
  }
  return channelInstance;
}

export function postClearChannel(senderPubkey: string, channelId: string): void {
  const ch = getChannel();
  if (!ch) return;
  ch.postMessage({ kind: 'clear-channel', senderPubkey, channelId } satisfies BroadcastMessage);
}

export function postClearDM(senderPubkey: string, pubkey: string): void {
  const ch = getChannel();
  if (!ch) return;
  ch.postMessage({ kind: 'clear-dm', senderPubkey, pubkey } satisfies BroadcastMessage);
}

export function subscribeBroadcast(cb: (msg: BroadcastMessage) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (ev: MessageEvent<BroadcastMessage>) => {
    if (ev && ev.data && typeof ev.data === 'object') cb(ev.data);
  };
  ch.addEventListener('message', listener);
  return () => {
    ch.removeEventListener('message', listener);
  };
}

/** Test-only: reset the singleton channel instance. */
export function __resetBroadcastChannelForTests(): void {
  if (channelInstance) {
    try { channelInstance.close(); } catch {}
  }
  channelInstance = null;
}
