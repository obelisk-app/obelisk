/**
 * What a `MeshSession` needs from its owner (`VoiceClient`, through
 * `client-assembly.ts`). Re-exported from `mesh-session.ts`.
 */
import type { RoomState } from './room-state';
import type { LocalMedia } from './local-media';
import type { ActiveCallWatcher } from './active-call-watcher';
import type { VoiceUiSink } from './ui-sink';
import type { VoiceMetrics } from './metrics';
import type { VoiceTransport } from './transport';
import type { VoiceSigner } from './constants';

export interface MeshSessionDeps {
  channelId: string;
  selfPubkey: string;
  signer: VoiceSigner;
  /** NIP-46: a human/relay round trip per signed event (slower beacon cadence). */
  remoteSigning: boolean;
  room: RoomState;
  ui: VoiceUiSink;
  transport: VoiceTransport;
  metrics: VoiceMetrics;
  localMedia: LocalMedia;
  /** Started with the roster subscription: its entry is a second discovery source. */
  watcher: ActiveCallWatcher;
  isJoined(): boolean;
  /** NIP-29 membership plus this session's pseudo-members; the client decides. */
  isMember(pubkey: string): boolean;
  sfuPubkey(): string | null;
  /** On, or entering, an SFU: no beacons go out. */
  sfuActive(): boolean;
  /** The remote said the room is full; the owner leaves. */
  onRoomFull(): void;
}
