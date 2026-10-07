/**
 * The media library: emoji / sticker packs (kind 30030) and the session's
 * favorites (kind 10030). Owns the two stores, the newest-wins stamps and the
 * library REQs. Pure move from `client.ts` (round 4 plan, step 8).
 */
import { CodedError } from '@/utils/errors/codes';
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_EMOJI_FAVORITES, KIND_EMOJI_SET, KIND_EVENT_DELETION } from '@/utils/nostr/nip-kinds';
import { EMPTY_MEDIA_FAVORITES, mediaFavoriteTags, mediaPackTags, parseMediaFavorites, parseMediaPack } from '@/utils/media/tags/media-packs';
import { getPreferences } from '@/services/preferences/preferences';
import { cacheDelete, cacheGet, cacheSet } from '../cache/cache';
import { PROFILE_RELAYS } from '../profile/profile-sync-cache';
import { StateStore } from '../common/state-store';
import type { BridgeContext } from '../facade/context';
import type { JsMediaFavorites, JsMediaPack } from '../common/types';

const BLOCKED_MEDIA_PACK_AUTHORS = new Set([
  '43fabde62ffea1aa0ddae7c0ac03b7017e2d864f8665784b00bbfa2f9114c06a',
]);

export type MediaPacksContext = Pick<
  BridgeContext,
  'session' | 'relays' | 'currentRelayUrl' | 'publishEvent' | 'subscribeWatched' | 'track'
>;

export class MediaPacksModule {
  readonly mediaPacks = new StateStore<Record<string, JsMediaPack>>({});
  readonly myMediaFavorites = new StateStore<JsMediaFavorites>(EMPTY_MEDIA_FAVORITES);
  private readonly mediaPackLatestAt = new Map<string, number>();
  private mediaLibrarySubscribed = false;

  constructor(private readonly ctx: MediaPacksContext) {}

  async saveMediaPack(
    pack: Pick<JsMediaPack, 'identifier' | 'title' | 'description' | 'image' | 'items'>,
  ): Promise<void> {
    const author = this.ctx.session()?.pubKeyHex ?? null;
    if (!author) throw new CodedError('not-logged-in', 'Not logged in.');
    const address = "30030:" + author + ":" + pack.identifier;
    const previousAt = Math.max(
      this.mediaPacks.get()[address]?.createdAt ?? 0,
      this.mediaPackLatestAt.get(address) ?? 0,
    );
    await this.ctx.publishEvent({
      kind: KIND_EMOJI_SET,
      content: '',
      tags: mediaPackTags(pack, author),
      created_at: Math.max(
        Math.floor(Date.now() / 1000),
        previousAt + 1,
      ),
    }, { extraRelays: PROFILE_RELAYS });
  }

  async deleteMediaPack(address: string): Promise<void> {
    const author = this.ctx.session()?.pubKeyHex ?? null;
    const pack = this.mediaPacks.get()[address];
    if (!author || !pack || pack.author !== author) throw new CodedError('own-packs-only', 'You can only delete your own packs.');
    const createdAt = Math.max(Math.floor(Date.now() / 1000), pack.createdAt + 1);
    await this.ctx.publishEvent({
      kind: KIND_EVENT_DELETION,
      content: 'delete media pack',
      tags: [['a', address], ['k', String(KIND_EMOJI_SET)]],
      created_at: createdAt,
    }, { extraRelays: PROFILE_RELAYS });
    this.mediaPackLatestAt.set(address, createdAt);
    this.mediaPacks.update((previous) => {
      const next = { ...previous };
      delete next[address];
      return next;
    });
    cacheDelete(this.ctx.currentRelayUrl.get(), KIND_EMOJI_SET, 'media-pack:' + address);
    if (this.myMediaFavorites.get().packAddresses.includes(address)) {
      await this.saveMediaFavorites({
        items: this.myMediaFavorites.get().items,
        packAddresses: this.myMediaFavorites.get().packAddresses.filter((value) => value !== address),
      });
    }
  }

  async saveMediaFavorites(
    favorites: Pick<JsMediaFavorites, 'items' | 'packAddresses'>,
  ): Promise<void> {
    const previousAt = this.myMediaFavorites.get().createdAt;
    await this.ctx.publishEvent({
      kind: KIND_EMOJI_FAVORITES,
      content: '',
      tags: mediaFavoriteTags({ ...favorites, createdAt: 0 }),
      created_at: Math.max(Math.floor(Date.now() / 1000), previousAt + 1),
    }, { extraRelays: PROFILE_RELAYS });
  }

  ingestMediaPack(ev: NostrEvent): void {
    if (ev.kind !== KIND_EMOJI_SET || BLOCKED_MEDIA_PACK_AUTHORS.has(ev.pubkey)) return;
    const pack = parseMediaPack(ev);
    if (!pack || pack.items.length === 0) return;
    if (ev.created_at <= (this.mediaPackLatestAt.get(pack.address) ?? 0)) return;
    this.mediaPackLatestAt.set(pack.address, ev.created_at);
    this.mediaPacks.update((prev) => ({ ...prev, [pack.address]: pack }));
    cacheSet(
      this.ctx.currentRelayUrl.get(),
      KIND_EMOJI_SET,
      `media-pack:${pack.address}`,
      pack,
    );
  }

  ingestMediaFavorites(ev: NostrEvent): void {
    const session = this.ctx.session();
    if (
      !session
      || ev.kind !== KIND_EMOJI_FAVORITES
      || ev.pubkey !== session.pubKeyHex
      || ev.created_at <= this.myMediaFavorites.get().createdAt
    ) return;
    const favorites = parseMediaFavorites(ev);
    this.myMediaFavorites.set(favorites);
    cacheSet(
      this.ctx.currentRelayUrl.get(),
      KIND_EMOJI_FAVORITES,
      `media-favorites:${ev.pubkey}`,
      favorites,
    );
  }

  /** Open the library REQs once per session; idempotent. */
  subscribe(): void {
    const session = this.ctx.session();
    if (!session || this.mediaLibrarySubscribed) return;
    this.mediaLibrarySubscribed = true;
    const relays = Array.from(new Set([
      ...this.ctx.relays(),
      ...PROFILE_RELAYS,
      ...getPreferences().socialRelays,
    ]));
    const options = {
      affectsRelayAccess: false,
      bypassWot: true,
      maxAttempts: 2,
    } as const;
    const packs = this.ctx.subscribeWatched(
      relays,
      { kinds: [KIND_EMOJI_SET], limit: 200 },
      (ev) => this.ingestMediaPack(ev),
      undefined,
      options,
    );
    const favorites = this.ctx.subscribeWatched(
      relays,
      { kinds: [KIND_EMOJI_FAVORITES], authors: [session.pubKeyHex], limit: 1 },
      (ev) => this.ingestMediaFavorites(ev),
      undefined,
      options,
    );
    this.ctx.track(packs, favorites);
  }

  /**
   * Paint the cached packs and the session's cached favorites for `relay`.
   * Cached packs from a blocked author are dropped from disk here.
   */
  seedFromCache(relay: string, ids: readonly string[]): void {
    const cachedPacks: Record<string, JsMediaPack> = {};
    for (const id of ids.filter((value) => value.startsWith('media-pack:'))) {
      const entry = cacheGet<JsMediaPack>(relay, KIND_EMOJI_SET, id);
      if (!entry) continue;
      const pack = entry.value;
      if (BLOCKED_MEDIA_PACK_AUTHORS.has(pack.author)) {
        cacheDelete(relay, KIND_EMOJI_SET, id);
        continue;
      }
      if ((this.mediaPackLatestAt.get(pack.address) ?? 0) >= pack.createdAt) continue;
      cachedPacks[pack.address] = pack;
      this.mediaPackLatestAt.set(pack.address, pack.createdAt);
    }
    if (Object.keys(cachedPacks).length > 0) {
      this.mediaPacks.update((prev) => ({ ...prev, ...cachedPacks }));
    }
    const mediaOwner = this.ctx.session()?.pubKeyHex;
    if (mediaOwner) {
      const entry = cacheGet<JsMediaFavorites>(
        relay,
        KIND_EMOJI_FAVORITES,
        `media-favorites:${mediaOwner}`,
      );
      if (entry) this.myMediaFavorites.set(entry.value);
    }
  }

  /** The library REQs were closed by the facade; the next `subscribe()` reopens them. */
  markUnsubscribed(): void {
    this.mediaLibrarySubscribed = false;
  }

  /** Session or relay change: drop every pack, favorite and stamp. */
  reset(): void {
    this.mediaPacks.set({});
    this.myMediaFavorites.set(EMPTY_MEDIA_FAVORITES);
    this.mediaPackLatestAt.clear();
    this.mediaLibrarySubscribed = false;
  }
}
