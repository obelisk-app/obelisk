/**
 * Group pings: the relay-wide live kind 9 REQ on the active relay, the
 * background watch of recently used relays, and the one place a kind 9
 * becomes a mention / reply card and a chime (`deliverGroupPing`). Pure move
 * from `client.ts` (round 4 plan, step 9). The watcher's REQs and its
 * `'watch'` AUTH leases are the hub's (step 6), reached through `deps`.
 */
import { translate } from '@/i18n/runtime';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_GROUP_CHAT_MESSAGE, KIND_GROUP_METADATA } from '@/utils/nostr/nip-kinds';
import { getPreferences } from '@/services/preferences/preferences';
import { extractMentionPubkeysFromMessage } from '@/utils/message-text/mentions';
import { announceIncoming } from '@/services/notifications/alert';
import { classifyGroupPing, groupPingTitle, previewText, replyTargetId } from '@/services/notifications/classify';
import { useNotificationsStore, type MentionReason } from '@/store/notifications';
import { getChannelPref, isChannelMuted, notifyLevel } from '@/store/chat/channel-prefs';
import {
  BackgroundRelayWatcher,
  backgroundTargets,
  loadRecentRelays,
  touchRecentRelay,
  type WatchHold,
  type WatchStreamCallbacks,
} from '../../relay/background-watch';
import { cacheGet } from '../../cache/cache';
import { getTag } from '../../common/event-tags';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import type { BridgeContext } from '../../facade/context';
import type { JsGroup, JsMessage } from '../../common/types';

export type PingsContext = Pick<
  BridgeContext,
  'session' | 'relays' | 'currentRelayUrl' | 'configuredRelays' | 'isLoggedIn' | 'groups' | 'messagesByGroup' | 'subscribeWatched' | 'track'
>;

export interface PingsDeps {
  /** A watch REQ on the hub's registry (`'background'` priority, no access reporting: not the browsed relay). */
  subscribeWatch(relay: string, filter: Filter, cb: WatchStreamCallbacks): WatchHold;
  /** `hub.acquireAuthLease(relay, 'watch')`: the hub answers NIP-42 on a relay only while it is watched. */
  acquireWatchLease(relay: string): WatchHold;
  /** A channel with its own kind 9 stream runs the full ingest (and the same notification). */
  hasOwnMessageStream(groupId: string): boolean;
  isMuted(pubkey: string): boolean;
  ensureUserMetadata(pubkey: string): void;
  /** Best-effort display name for OS popups; never blocks on a fetch. */
  displayNameFor(pubkey: string): string;
}

export interface GroupPing {
  relay: string;
  channelId: string;
  ev: NostrEvent;
  reason: MentionReason | null;
  watching: boolean;
  where: string | null;
}

export class PingsModule {
  /**
   * Mentions/replies on the last few relays the user used but isn't
   * browsing. See `background-watch.ts` for the scope and privacy argument.
   */
  private readonly backgroundWatcher: BackgroundRelayWatcher;

  constructor(
    private readonly ctx: PingsContext,
    private readonly deps: PingsDeps,
  ) {
    this.backgroundWatcher = new BackgroundRelayWatcher({
      subscribe: (relay, filter, cb) => deps.subscribeWatch(relay, filter, cb),
      acquireLease: (relay) => deps.acquireWatchLease(relay),
      onEvent: (relay, ev) => this.ingestPing(relay, ev, 'background'),
      // Start from the relay's mention cursor so pings that landed while the
      // app was closed still produce a card (they're too old to chime).
      sinceFor: (relay) => Math.floor((useNotificationsStore.getState().mentionCursorByRelay[relay] ?? Date.now()) / 1000),
    });
  }

  /** The user opened or posted on `relay`: it joins the MRU the watch follows. */
  recordRelayUse(relay: string): void {
    const me = this.ctx.session()?.pubKeyHex;
    if (!me) return;
    const before = loadRecentRelays(me).join('|');
    const after = touchRecentRelay(me, relay).join('|');
    if (before !== after) this.syncBackgroundWatch();
  }

  syncBackgroundWatch(): void {
    const me = this.ctx.session()?.pubKeyHex ?? null;
    if (!me || !this.ctx.isLoggedIn.get() || !getPreferences().backgroundRelayWatch) {
      this.backgroundWatcher.stop();
      return;
    }
    this.backgroundWatcher.sync(
      me,
      backgroundTargets(loadRecentRelays(me), this.ctx.currentRelayUrl.get(), this.ctx.configuredRelays.get()),
    );
  }

  watchedRelays(): string[] {
    return this.backgroundWatcher.watched;
  }

  stop(): void {
    this.backgroundWatcher.stop();
  }

  subscribeLivePings(): void {
    const sub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      { kinds: [KIND_GROUP_CHAT_MESSAGE], since: Math.floor(Date.now() / 1000) - 30 },
      (ev) => this.ingestPing(this.ctx.currentRelayUrl.get(), ev, 'active'),
      undefined,
      { affectsRelayAccess: false },
    );
    this.ctx.track(sub);
  }

  /** A kind 9 from the live REQ (`active`) or the watcher (`background`). */
  ingestPing(relay: string, ev: NostrEvent, source: 'active' | 'background'): void {
    if (ev.kind !== KIND_GROUP_CHAT_MESSAGE) return;
    const relayKey = normalizeRelayUrl(relay);
    const isActive = relayKey === normalizeRelayUrl(this.ctx.currentRelayUrl.get());
    // The watcher may still hold a relay the user just switched to; the
    // main pool owns it now.
    if (source === 'background' && isActive) return;
    if (source === 'active' && !isActive) return;
    const channelId = getTag(ev, 'h');
    if (!channelId) return;
    if (isActive) {
      // A live per-channel stream runs the full ingest (and the same
      // notification): don't race it.
      if (this.deps.hasOwnMessageStream(channelId)) return;
    }
    if (this.deps.isMuted(ev.pubkey)) return;
    const me = this.ctx.session()?.pubKeyHex ?? null;
    if (!me || ev.pubkey === me) return;
    const mentions = extractMentionPubkeysFromMessage(ev.content, ev.tags);
    const replyTo = replyTargetId(ev.tags);
    let parentAuthor: string | null = null;
    if (replyTo) {
      const known = isActive
        ? this.ctx.messagesByGroup.get()[channelId]
        : cacheGet<JsMessage[]>(relayKey, KIND_GROUP_CHAT_MESSAGE, channelId)?.value;
      parentAuthor = known?.find((m) => m.id === replyTo)?.pubkey ?? null;
    }
    const reason = classifyGroupPing({ pubkey: ev.pubkey, tags: ev.tags, mentions, parentAuthor }, me);
    const channelName = isActive
      ? (this.ctx.groups.get().find((g) => g.id === channelId)?.name ?? null)
      : (cacheGet<{ group: JsGroup }>(relayKey, KIND_GROUP_METADATA, channelId)?.value.group.name ?? null);
    const host = relayKey.replace(/^wss?:\/\//, '');
    const where = isActive
      ? (channelName ? `#${channelName}` : null)
      : (channelName ? `#${channelName} · ${host}` : host);
    this.deliverGroupPing({ relay: relayKey, channelId, ev, reason, watching: false, where });
  }

  /** A kind 9 that may concern the user: card it, and chime unless quiet. Also fed by the messages ingest. */
  deliverGroupPing(opts: GroupPing): void {
    const { relay, channelId, ev, reason, watching, where } = opts;
    const me = this.ctx.session()?.pubKeyHex ?? null;
    if (!me || ev.pubkey === me) return;
    const pref = getChannelPref(relay, channelId);
    const level = notifyLevel(pref);
    if (level === 'nothing') return;
    const quiet = watching || isChannelMuted(pref);
    if (reason) {
      const added = useNotificationsStore.getState().pushMention({
        id: ev.id,
        relay,
        channelId,
        senderPubkey: ev.pubkey,
        preview: ev.content.slice(0, 280),
        createdAt: ev.created_at * 1000,
        reason,
      });
      if (!added) return;
      this.deps.ensureUserMetadata(ev.pubkey);
      if (quiet) return;
      announceIncoming({
        kind: reason,
        id: ev.id,
        createdAt: ev.created_at * 1000,
        title: groupPingTitle(reason, this.deps.displayNameFor(ev.pubkey), where),
        body: previewText(ev.content),
      });
      return;
    }
    if (level !== 'all' || pref.unfollowed || quiet) return;
    announceIncoming({
      kind: 'mention',
      id: ev.id,
      createdAt: ev.created_at * 1000,
      title: where
        ? translate('common.ping.postedIn', { sender: this.deps.displayNameFor(ev.pubkey), where })
        : this.deps.displayNameFor(ev.pubkey),
      body: previewText(ev.content),
    });
  }
}
