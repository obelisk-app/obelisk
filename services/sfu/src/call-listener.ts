/**
 * Listens for kind 25052 control events addressed to the SFU.
 *
 * Filter: `{ kinds: [KIND_SFU_CONTROL], "#p": [SFU_PUBKEY], since: now-60 }`.
 * Each event runs through the validation pipeline in docs/sfu-system.md §3.2:
 *
 *   1. Signature already verified by SimplePool.
 *   2. NIP-40 expiration not in the past.
 *   3. allow-list / operator / host check (action-specific).
 *   4. dispatch to RoomManager.
 *
 * Validation failures are silent drops. No reply events. The user finds
 * out by observing the absence of a kind 31314 update.
 */
import type { Event } from 'nostr-tools';

import { KIND_SFU_CONTROL } from './nip-kinds.js';
import { createLogger } from './log.js';
import { isAllowedToStart, canManageRoom, isTrustedAuthorRelay } from './auth.js';
import type { Config } from './config.js';
import type { RelayPool } from './relay.js';
import type { RoomManager } from './room-manager.js';
import type { Hex, RoomRules, SfuControlPayload, SfuControlAction } from './types.js';

const log = createLogger('call-listener');

const STARTING_RULES: RoomRules = {
  video: true,
  screen: true,
  allow: null,
  deny: [],
  maxParticipants: null,
  endsAt: null,
};

export class CallListener {
  private unsub: (() => void) | null = null;
  /**
   * Event-id → expiry timestamp (unix seconds). We subscribe per relay
   * (so we can distinguish trusted vs untrusted sources), so an event
   * published to multiple relays will be delivered multiple times.
   * Dedupe so the action runs at most once per event id.
   */
  private seenEventIds = new Map<string, number>();

  constructor(
    private readonly cfg: Config,
    private readonly relay: RelayPool,
    private readonly rooms: RoomManager,
  ) {}

  start(): void {
    if (this.unsub) return;
    const since = Math.floor(Date.now() / 1000) - 60;
    // Subscribe per-relay so we know which relay delivered each event.
    // Events seen on a trusted-author relay bypass the allow.json check
    // (the relay's own write-whitelist authorized the publisher).
    //
    // We also drop the `#p` filter — some relays don't index `#p` on
    // ephemeral kinds — and gate by p-tag in `handle()`.
    const allRelays = Array.from(
      new Set([...this.cfg.relays, ...this.cfg.trustedAuthorRelays]),
    );
    this.unsub = this.relay.subscribePerRelay(
      allRelays,
      {
        kinds: [KIND_SFU_CONTROL],
        since,
      },
      (ev, source) => this.handle(ev, source),
    );
    log.info('listening for control events', {
      pubkey: this.relay.pubkey.slice(0, 12) + '…',
      relays: allRelays.length,
      trusted: this.cfg.trustedAuthorRelays.length,
    });
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
  }

  /** Returns true if this is the first time we see the event id. */
  private rememberEvent(id: string): boolean {
    this.gcSeen();
    if (this.seenEventIds.has(id)) return false;
    // 5-minute TTL — control events are ephemeral and short-lived.
    this.seenEventIds.set(id, Math.floor(Date.now() / 1000) + 300);
    return true;
  }

  private gcSeen(): void {
    if (this.seenEventIds.size < 256) return;
    const now = Math.floor(Date.now() / 1000);
    for (const [id, exp] of this.seenEventIds) {
      if (exp < now) this.seenEventIds.delete(id);
    }
  }

  private handle(ev: Event, sourceRelay: string): void {
    // Gate by p-tag — we subscribe broadly to work around relays that
    // don't index `#p` on ephemeral kinds.
    const targetedAtUs = ev.tags.some(
      (t) => t[0] === 'p' && t[1] === this.relay.pubkey,
    );
    if (!targetedAtUs) return;

    // Per-relay subscriptions can deliver the same event multiple times.
    // First-write wins; subsequent deliveries are dropped at this gate.
    if (!this.rememberEvent(ev.id)) return;

    // Defensive: SimplePool already verifies sigs but we check the tag set.
    const channelTag = ev.tags.find((t) => t[0] === 'e')?.[1];
    if (!channelTag) {
      log.debug('drop control: missing #e', { id: ev.id.slice(0, 8) });
      return;
    }

    if (isExpired(ev)) {
      log.debug('drop control: expired', { id: ev.id.slice(0, 8) });
      return;
    }

    let payload: SfuControlPayload;
    try {
      payload = JSON.parse(ev.content) as SfuControlPayload;
    } catch {
      log.debug('drop control: bad json', { id: ev.id.slice(0, 8) });
      return;
    }

    const action = payload.action as SfuControlAction;
    const fromTrustedRelay = isTrustedAuthorRelay(this.cfg, sourceRelay);
    log.info('control received', {
      action,
      from: ev.pubkey.slice(0, 8),
      channel: channelTag.slice(0, 8),
      via: sourceRelay,
      trusted: fromTrustedRelay,
    });

    switch (action) {
      case 'start':
        return void this.handleStart(ev.pubkey, channelTag, payload, fromTrustedRelay);
      case 'end':
        return void this.handleEnd(ev.pubkey, channelTag);
      case 'kick':
        return void this.handleKick(ev.pubkey, channelTag, payload);
      case 'update':
        return void this.handleUpdate(ev.pubkey, channelTag, payload);
      default:
        log.debug('drop control: unknown action', { action });
    }
  }

  private async handleStart(
    sender: Hex,
    channelId: string,
    payload: SfuControlPayload,
    fromTrustedRelay: boolean,
  ): Promise<void> {
    // The trusted-relay path is the production-grade gate: anyone whose
    // event made it to a trusted-author relay's subscription is by
    // construction authorized (the relay's whitelist gated the publish).
    // The local allow.json + operator key remain as the manual override.
    const authorized =
      fromTrustedRelay
      || isAllowedToStart(this.cfg, this.relay.pubkey, sender);
    if (!authorized) {
      log.warn('start rejected: sender not authorized (no allow-list / not on trusted relay)', {
        sender: sender.slice(0, 8),
      });
      return;
    }

    const existing = this.rooms.get(channelId);
    if (existing) {
      log.info('start ignored: room already active', { channelId: channelId.slice(0, 8) });
      return;
    }

    if (this.rooms.size() >= this.cfg.maxRooms) {
      log.warn('start rejected: max_rooms reached', { max: this.cfg.maxRooms });
      return;
    }

    const rules = mergeRules(STARTING_RULES, payload.params);

    try {
      await this.rooms.start(channelId, sender, rules);
      log.info('start accepted', {
        host: sender.slice(0, 8),
        channelId: channelId.slice(0, 8),
        rules: { video: rules.video, screen: rules.screen, allow: rules.allow?.length ?? 'any' },
      });
    } catch (err) {
      log.error('start failed', {
        channelId: channelId.slice(0, 8),
        err: (err as Error).message,
      });
    }
  }

  private async handleEnd(sender: Hex, channelId: string): Promise<void> {
    const room = this.rooms.get(channelId);
    if (!room) {
      log.debug('end ignored: no active room', { channelId: channelId.slice(0, 8) });
      return;
    }
    if (!canManageRoom(this.cfg, this.relay.pubkey, sender, room.hostPubkey)) {
      log.warn('end rejected: sender not host or operator', { sender: sender.slice(0, 8) });
      return;
    }
    await this.rooms.end(channelId);
  }

  private async handleKick(
    sender: Hex,
    channelId: string,
    payload: SfuControlPayload,
  ): Promise<void> {
    const room = this.rooms.get(channelId);
    if (!room) return;
    if (!canManageRoom(this.cfg, this.relay.pubkey, sender, room.hostPubkey)) {
      log.warn('kick rejected: sender not host or operator', { sender: sender.slice(0, 8) });
      return;
    }
    const target = payload.params?.target;
    if (!target || !/^[0-9a-f]{64}$/i.test(target)) {
      log.debug('kick: invalid target', { target });
      return;
    }
    await room.kick(target.toLowerCase(), payload.params?.reason);
  }

  private async handleUpdate(
    sender: Hex,
    channelId: string,
    payload: SfuControlPayload,
  ): Promise<void> {
    const room = this.rooms.get(channelId);
    if (!room) return;
    if (!canManageRoom(this.cfg, this.relay.pubkey, sender, room.hostPubkey)) {
      log.warn('update rejected: sender not host or operator', { sender: sender.slice(0, 8) });
      return;
    }
    room.updateRules(mergeRules(room.rules, payload.params));
  }
}

function isExpired(ev: Event): boolean {
  const tag = ev.tags.find((t) => t[0] === 'expiration')?.[1];
  if (!tag) return false;
  const ts = parseInt(tag, 10);
  if (!Number.isFinite(ts)) return false;
  return ts < Math.floor(Date.now() / 1000);
}

function mergeRules(base: RoomRules, params: SfuControlPayload['params']): RoomRules {
  if (!params) return base;
  return {
    video: params.video ?? base.video,
    screen: params.screen ?? base.screen,
    allow: params.allow !== undefined ? params.allow : base.allow,
    deny: params.deny ?? base.deny,
    maxParticipants: params.maxParticipants !== undefined ? params.maxParticipants : base.maxParticipants,
    endsAt: params.endsAt !== undefined ? params.endsAt : base.endsAt,
  };
}
