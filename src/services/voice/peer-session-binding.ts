/**
 * Which remote negotiation a `Peer` belongs to. A Peer binds to the remote's
 * `sessionId` on first contact; afterwards, anything from another session
 * belongs to a connection attempt that no longer exists on one side or the
 * other, except an offer, which the owner follows with a fresh Peer.
 */
import { isOffer } from '@/utils/voice/signal-payload';
import type { VoiceSignalPayload } from '@/types/voice/protocol';
import type { PeerEvents } from '@/types/voice/peer';

export interface SessionBindingHost {
  readonly remotePubkey: string;
  readonly events: Pick<PeerEvents, 'onRemoteSessionChanged'>;
}

export class PeerSessionBinding {
  /** Remote's `sessionId` for this connection, learned from its first signal. */
  private remoteSessionId: string | null = null;

  constructor(private readonly host: SessionBindingHost) {}

  /**
   * Bind to the remote's session on first contact; afterwards, anything
   * from another session belongs to a connection attempt that no longer
   * exists on one side or the other.
   *
   * Exempt: `requestReset` (it is how a rebuilt remote announces itself)
   * and a `room-full` bye (sent by the remote client, not by a Peer).
   * Signals without a `sessionId` (older clients) are accepted as before.
   */
  accepts(payload: VoiceSignalPayload): boolean {
    const incoming = payload.sessionId;
    if (!incoming) return true;
    if (payload.type === 'requestReset') return true;
    if (payload.type === 'bye' && payload.byeReason === 'room-full') return true;
    if (this.remoteSessionId === null || this.remoteSessionId === incoming) {
      this.remoteSessionId = incoming;
      return true;
    }
    if (isOffer(payload) && this.host.events.onRemoteSessionChanged) {
      this.host.events.onRemoteSessionChanged(payload);
      return false;
    }
    console.debug('[voice] dropped', payload.type, 'from stale session of', this.host.remotePubkey.slice(0, 8));
    return false;
  }
}
