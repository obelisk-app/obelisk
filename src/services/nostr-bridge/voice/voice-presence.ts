/**
 * Voice presence and active calls: mesh presence beacons (kind 20078) and
 * SFU active-call advertisements (kind 31314) folded into one
 * `activeCallByChannel` store for the sidebar's LIVE badges and the join
 * view's roster. Pure move from `client.ts` (round 4 plan, step 10). The
 * REQs themselves (`subscribeVoiceFilterWatched`, on the hub at `'voice'`
 * priority since step 5) are not here.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { BoundedMap } from '@/lib/relay-hub';
import { KIND_SFU_ACTIVE_CALL, KIND_VOICE_PRESENCE } from '@/constants/nostr/nip-kinds';
import { getAllTags, getTag } from '../common/event-tags';
import { resubscribeOnQuotaClose } from '../relay/quota-resubscribe';
import { StateStore } from '../common/state-store';
import {
  deriveActiveCalls,
  mergePubkeys,
  parseSfuParticipantPubkeys,
  type ActiveCallInfo,
  type MeshPresence,
  type SfuActiveCall,
  type SfuPresence,
} from './voice-calls';
import type { BridgeContext } from '../facade/context';
import { MAX_PRESENCE_STAMPS } from '@/constants/nostr-bridge/voice';

export type { ActiveCallInfo } from './voice-calls';

export type VoicePresenceContext = Pick<BridgeContext, 'relays' | 'subscribeWatched' | 'track'>;

export class VoicePresenceModule {
  /**
   * SFU active-call state per channel id. Populated from kind 31314 events
   * the SFU publishes when a room is live. The UI reads this to show a
   * "LIVE" indicator on voice channels in the sidebar, even for users
   * who aren't currently joined. `null` (or missing entry) means no active
   * call known. Entries auto-expire client-side once `expiresAt` passes
   * so a stale advertisement doesn't pin "LIVE" forever after an SFU
   * crash that never published `status=closed`.
   */
  readonly activeCallByChannel = new StateStore<Record<string, ActiveCallInfo>>({});
  private readonly sfuActiveCalls = new Map<string, SfuActiveCall>();
  private readonly sfuPresenceByChannel = new Map<string, Map<string, SfuPresence>>();
  private readonly meshPresenceByChannel = new Map<string, Map<string, MeshPresence>>();
  /** Newest mesh presence event seen per `channelId|pubkey`, including leave tombstones. */
  private readonly meshPresenceSeenAt = new BoundedMap<string, number>({ maxEntries: MAX_PRESENCE_STAMPS, policy: 'lru' });
  private meshPresenceSweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ctx: VoicePresenceContext) {}

  /** Open the relay-wide kind 31314 and kind 20078 REQs on the active relay. */
  subscribe(): void {
    const sfuSub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      { kinds: [KIND_SFU_ACTIVE_CALL] },
      (ev) => this.ingestActiveCall(ev),
      undefined,
      { affectsRelayAccess: false },
    );
    this.ctx.track(sfuSub);

    // `#t` keeps the filter indexed while still covering every channel,
    // every beacon carries it. Kind-only reads as a scrape to the relay's
    // unindexed-query budget, which then CLOSEs it rate-limited; unlike the
    // bulk subs, the LIVE badges have nothing else to fall back on, so reopen.
    const relays = this.ctx.relays();
    const closeMesh = resubscribeOnQuotaClose(({ onQuotaOrRateLimitClose, alive }) => {
      const sub = this.ctx.subscribeWatched(
        relays,
        { kinds: [KIND_VOICE_PRESENCE], '#t': ['obelisk-voice-presence'] } as Filter,
        (ev) => { alive(); this.ingestMeshVoicePresence(ev); },
        alive,
        { affectsRelayAccess: false, onQuotaOrRateLimitClose },
      );
      return () => sub.close();
    });
    this.ctx.track({ close: closeMesh });
    this.ensureMeshPresenceSweep();
  }

  private ingestActiveCall(ev: NostrEvent): void {
    const channelId = getTag(ev, 'd');
    if (!channelId) return;
    const status = getTag(ev, 'status') ?? 'active';
    const hostPubkey = getTag(ev, 'host') ?? ev.pubkey;
    const expirationStr = getTag(ev, 'expiration');
    const expiresAt = expirationStr ? parseInt(expirationStr, 10) || 0 : 0;
    const participantPubkeys = parseSfuParticipantPubkeys(ev);
    // Participant count: SFU started tagging this so consumers can
    // distinguish "live call with people" from "room still open during
    // empty-grace." Older SFU builds don't tag - treat absent as -1
    // (unknown, render badge to preserve back-compat) unless the event
    // content/tags include a passive participant roster.
    const countStr = getTag(ev, 'count');
    const participantCount = countStr === undefined
      ? (participantPubkeys.length > 0 ? participantPubkeys.length : -1)
      : (parseInt(countStr, 10) || 0);
    const prev = this.sfuActiveCalls.get(channelId);
    // Newest-wins: replaceable kind, stale duplicates from slow relays
    // shouldn't overwrite a fresher announcement.
    if (prev && prev.createdAt >= ev.created_at) return;
    if (status === 'closed') {
      this.sfuActiveCalls.delete(channelId);
      this.sfuPresenceByChannel.delete(channelId);
      this.recomputeActiveCallByChannel();
      return;
    }
    this.sfuActiveCalls.set(channelId, {
      hostPubkey,
      status,
      participantCount,
      expiresAt,
      createdAt: ev.created_at,
      mode: 'sfu',
      participantPubkeys: participantPubkeys.length > 0 ? participantPubkeys : undefined,
    });
    this.recomputeActiveCallByChannel();
  }

  /** A kind 20078 beacon, from the relay or one the session just signed. */
  ingestMeshVoicePresence(ev: NostrEvent): void {
    if (!ev.tags.some((t) => t[0] === 't' && t[1] === 'obelisk-voice-presence')) return;
    const channelId = getTag(ev, 'e');
    if (!channelId) return;
    const expirationStr = getTag(ev, 'expiration');
    const expiresAt = expirationStr
      ? parseInt(expirationStr, 10) || 0
      : ev.created_at + 30;
    if (!Number.isFinite(expiresAt)) return;

    const status = getTag(ev, 'status');
    const expired = expiresAt <= Math.floor(Date.now() / 1000);
    const terminal = status === 'left' || status === 'closed' || expired;
    const seenKey = `${channelId}|${ev.pubkey}`;
    const seenAt = this.meshPresenceSeenAt.get(seenKey) ?? 0;
    if (seenAt > ev.created_at) return;
    if (seenAt === ev.created_at && !terminal) return;
    this.meshPresenceSeenAt.set(seenKey, ev.created_at);

    // SFU infrastructure publishes kind 20078 with ["sfu","1"] and p-tags
    // for users it has live PCs to. Those p-tags are passive roster evidence
    // for the Join Channel view, but the SFU pubkey itself is not a mesh
    // participant and must not be counted as one.
    if (ev.tags.some((t) => t[0] === 'sfu' && t[1] === '1')) {
      this.ingestSfuVoicePresence(ev, channelId, expiresAt);
      return;
    }

    let byPubkey = this.meshPresenceByChannel.get(channelId);
    if (terminal) {
      byPubkey?.delete(ev.pubkey);
      if (byPubkey && byPubkey.size === 0) this.meshPresenceByChannel.delete(channelId);
      this.recomputeActiveCallByChannel();
      return;
    }

    if (!byPubkey) {
      byPubkey = new Map();
      this.meshPresenceByChannel.set(channelId, byPubkey);
    }
    byPubkey.set(ev.pubkey, { expiresAt, createdAt: ev.created_at });
    this.recomputeActiveCallByChannel();
  }

  private ingestSfuVoicePresence(ev: NostrEvent, channelId: string, expiresAt: number): void {
    let bySfu = this.sfuPresenceByChannel.get(channelId);
    if (!bySfu) {
      bySfu = new Map();
      this.sfuPresenceByChannel.set(channelId, bySfu);
    }
    const prev = bySfu.get(ev.pubkey);
    if (prev && prev.createdAt >= ev.created_at) return;

    const participantPubkeys = mergePubkeys(getAllTags(ev, 'p'));
    if (participantPubkeys.length === 0) {
      bySfu.delete(ev.pubkey);
      if (bySfu.size === 0) this.sfuPresenceByChannel.delete(channelId);
      this.recomputeActiveCallByChannel();
      return;
    }

    bySfu.set(ev.pubkey, { expiresAt, createdAt: ev.created_at, participantPubkeys });
    this.recomputeActiveCallByChannel();
  }

  private ensureMeshPresenceSweep(): void {
    if (this.meshPresenceSweepTimer) return;
    this.meshPresenceSweepTimer = setInterval(() => {
      if (this.pruneMeshPresence()) this.recomputeActiveCallByChannel();
    }, 15_000);
  }

  private pruneMeshPresence(): boolean {
    const now = Math.floor(Date.now() / 1000);
    let changed = false;
    for (const [channelId, byPubkey] of Array.from(this.meshPresenceByChannel.entries())) {
      for (const [pubkey, presence] of Array.from(byPubkey.entries())) {
        if (presence.expiresAt > now) continue;
        byPubkey.delete(pubkey);
        changed = true;
      }
      if (byPubkey.size === 0) {
        this.meshPresenceByChannel.delete(channelId);
        changed = true;
      }
    }
    for (const [channelId, bySfu] of Array.from(this.sfuPresenceByChannel.entries())) {
      for (const [sfuPubkey, presence] of Array.from(bySfu.entries())) {
        if (presence.expiresAt > now) continue;
        bySfu.delete(sfuPubkey);
        changed = true;
      }
      if (bySfu.size === 0) {
        this.sfuPresenceByChannel.delete(channelId);
        changed = true;
      }
    }
    return changed;
  }

  private recomputeActiveCallByChannel(): void {
    this.pruneMeshPresence();
    this.activeCallByChannel.set(deriveActiveCalls(this.meshPresenceByChannel, this.sfuPresenceByChannel, this.sfuActiveCalls));
  }

  /** Newest-beacon stamps held now; for the bound test. */
  presenceStampCount(): number {
    return this.meshPresenceSeenAt.size;
  }

  /** Session or relay change, and dispose: forget every call and stop the sweep. */
  reset(): void {
    this.sfuActiveCalls.clear();
    this.sfuPresenceByChannel.clear();
    this.meshPresenceByChannel.clear();
    this.meshPresenceSeenAt.clear();
    if (this.meshPresenceSweepTimer) {
      clearInterval(this.meshPresenceSweepTimer);
      this.meshPresenceSweepTimer = null;
    }
    this.activeCallByChannel.set({});
  }
}
