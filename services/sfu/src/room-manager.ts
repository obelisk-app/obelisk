/**
 * Owns the set of active rooms. Single instance, holds the `Map<channelId, Room>`.
 * Concurrency note: all event-driven code in this service runs on the
 * Node main thread, so plain Map mutation is safe — no locks needed.
 */
import { createLogger } from './log.js';
import { Room } from './room.js';
import { MediasoupRoom } from './room-mediasoup.js';
import type { Config } from './config.js';
import type { MediasoupEngine } from './mediasoup-server.js';
import type { MembershipTracker } from './membership.js';
import type { RelayPool } from './relay.js';
import type { Hex, RoomRules, RoomSnapshot } from './types.js';

const log = createLogger('rooms');

/** Engine-agnostic room handle — lets RoomManager dispatch by `cfg.engine`. */
export interface RoomLike {
  start(): Promise<void>;
  close(): Promise<void>;
  snapshot(): RoomSnapshot;
  /** Host pubkey — call-listener checks this for end/kick/update authorization. */
  readonly hostPubkey: Hex;
  /** Current room rules — read-only snapshot fed back into mergeRules. */
  readonly rules: RoomRules;
  /** Force-disconnect a participant. `reason` flows into the leave notification. */
  kick(targetPubkey: Hex, reason?: string): Promise<void>;
  /** Replace room rules in-place. Re-sends to active peers if their consent changed. */
  updateRules(rules: RoomRules): void;
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomLike>();

  constructor(
    private readonly cfg: Config,
    private readonly relay: RelayPool,
    private readonly membership: MembershipTracker,
    private readonly engine: MediasoupEngine | null,
  ) {
    if (cfg.engine === 'mediasoup' && !engine) {
      throw new Error('RoomManager: SFU_ENGINE=mediasoup requires the mediasoup engine to be passed in');
    }
  }

  size(): number {
    return this.rooms.size;
  }

  get(channelId: string): RoomLike | undefined {
    return this.rooms.get(channelId);
  }

  list(): RoomSnapshot[] {
    return Array.from(this.rooms.values()).map((r) => r.snapshot());
  }

  async start(channelId: string, hostPubkey: Hex, rules: RoomRules): Promise<RoomLike> {
    if (this.rooms.has(channelId)) {
      throw new Error(`room already active for channel ${channelId}`);
    }
    const room: RoomLike = this.cfg.engine === 'mediasoup'
      ? new MediasoupRoom({
          channelId,
          hostPubkey,
          rules,
          cfg: this.cfg,
          engine: this.engine!,
          relay: this.relay,
          membership: this.membership,
          onClosed: (id) => this.rooms.delete(id),
        })
      : new Room({
          channelId,
          hostPubkey,
          rules,
          cfg: this.cfg,
          relay: this.relay,
          membership: this.membership,
          onClosed: (id) => this.rooms.delete(id),
        });
    this.rooms.set(channelId, room);
    try {
      await room.start();
    } catch (err) {
      this.rooms.delete(channelId);
      throw err;
    }
    return room;
  }

  async end(channelId: string): Promise<void> {
    const room = this.rooms.get(channelId);
    if (!room) return;
    await room.close();
  }

  /**
   * Drain — stop accepting new rooms, let existing ones finish naturally.
   * Used by SIGUSR1.
   */
  setDraining(): void {
    log.info('drain requested — no new rooms will be accepted (existing rooms continue)');
    // call-listener checks `size()` against `cfg.maxRooms`; we don't have
    // a separate "no-more-starts" flag here. Simplest implementation:
    // raise the floor to current size so additional starts are refused.
    // Implemented as a private flag so the listener can consult it.
    this.draining = true;
  }

  isDraining(): boolean {
    return this.draining;
  }

  private draining = false;

  async closeAll(): Promise<void> {
    log.info('closing all rooms', { count: this.rooms.size });
    const all = Array.from(this.rooms.values());
    await Promise.allSettled(all.map((r) => r.close()));
    this.rooms.clear();
  }
}
