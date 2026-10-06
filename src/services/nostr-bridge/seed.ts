/**
 * The cold paint (round 4 plan, step 17): one `bridgeCache` listing for the
 * relay, then each module seeds its own state from it, in the order the
 * facade always did (metadata first, since it says which groups are hidden;
 * then membership, profiles, media, messages, reactions). Called on page
 * reload, on login and on a relay switch, so the sidebar and the open
 * channel paint last-known state before the relay answers; live events
 * overwrite it through each module's newest-wins ingest.
 *
 * Relay-scoped: each relay has its own lists, so only the active relay is
 * seeded. Caches for other relays stay on disk untouched (they re-paint
 * instantly if the user switches back).
 */
import {
  KIND_EMOJI_FAVORITES,
  KIND_EMOJI_SET,
  KIND_GROUP_ADMINS,
  KIND_GROUP_CHAT_MESSAGE,
  KIND_GROUP_CREATE,
  KIND_GROUP_MEMBERS,
  KIND_GROUP_METADATA,
  KIND_METADATA,
  KIND_REACTION,
} from '@/utils/nip-kinds';
import { cacheListIdsByKind } from './cache';

type IdsFor = (kind: number) => string[];

export interface SeedTargets {
  metadata: { seedFromCache(relay: string, idsFor: IdsFor): { hiddenGroupIds: Set<string>; renderable: boolean } };
  membership: { seedFromCache(relay: string, hiddenGroupIds: ReadonlySet<string>, idsFor: IdsFor): void };
  profiles: { seedFromCache(relay: string, pubkeys: readonly string[]): void };
  media: { seedFromCache(relay: string, ids: readonly string[]): void };
  messages: { seedFromCache(relay: string, hiddenGroupIds: ReadonlySet<string>, idsFor: IdsFor): boolean };
  reactions: { seedFromCache(relay: string, hiddenGroupIds: ReadonlySet<string>, idsFor: IdsFor): void };
}

/** Seed every module for `relay`. True when the cache held something a chat shell can render. */
export function seedCacheForRelay(relay: string, targets: SeedTargets): boolean {
  const ids = cacheListIdsByKind(relay, [
    KIND_GROUP_METADATA,
    KIND_GROUP_ADMINS,
    KIND_GROUP_MEMBERS,
    KIND_GROUP_CREATE,
    KIND_METADATA,
    KIND_GROUP_CHAT_MESSAGE,
    KIND_REACTION,
    KIND_EMOJI_SET,
    KIND_EMOJI_FAVORITES,
  ]);
  const idsFor = (kind: number) => ids.get(kind) ?? [];
  let hasRenderableCache = false;

  const seeded = targets.metadata.seedFromCache(relay, idsFor);
  const { hiddenGroupIds } = seeded;
  if (seeded.renderable) hasRenderableCache = true;

  targets.membership.seedFromCache(relay, hiddenGroupIds, idsFor);

  targets.profiles.seedFromCache(relay, idsFor(KIND_METADATA));

  targets.media.seedFromCache(relay, idsFor(KIND_EMOJI_SET));

  if (targets.messages.seedFromCache(relay, hiddenGroupIds, idsFor)) hasRenderableCache = true;

  targets.reactions.seedFromCache(relay, hiddenGroupIds, idsFor);
  return hasRenderableCache;
}
