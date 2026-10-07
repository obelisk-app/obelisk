/**
 * Account backup: every event the session authored, paged back through the
 * active, configured and profile relays, plus the media packs its favorites
 * reference. Pure move from `client.ts` (round 4 plan, step 8).
 */
import { CodedError } from '@/utils/errors/codes';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_EMOJI_FAVORITES, KIND_EMOJI_SET } from '@/utils/nostr/nip-kinds';
import { PROFILE_RELAYS } from '../profile/profile-sync-cache';
import { uniqueRelayUrls } from '../relay/relay-list';
import type { BridgeContext } from './context';

export type ExportContext = Pick<BridgeContext, 'session' | 'relays' | 'configuredRelays' | 'queryRelaysWithConfidence'>;

export interface AccountExport {
  pubkey: string;
  relays: string[];
  events: NostrEvent[];
  referencedMediaPackEvents: NostrEvent[];
  complete: boolean;
}

export async function exportAccountData(ctx: ExportContext): Promise<AccountExport> {
  const pubkey = ctx.session()?.pubKeyHex ?? null;
  if (!pubkey) throw new CodedError('not-logged-in', "Log in before creating a backup.");
  const relays = uniqueRelayUrls([
    ...ctx.relays(),
    ...ctx.configuredRelays.get(),
    ...PROFILE_RELAYS,
  ]);
  const byId = new Map<string, NostrEvent>();
  let until: number | undefined;
  let complete = true;

  // Relays cap query results independently, so walk backwards until a page
  // contributes no new events. This also stops broken relays that ignore until.
  while (true) {
    const filter: Filter = { authors: [pubkey], limit: 1000 };
    if (until !== undefined) filter.until = until;
    // Bypass the result cache: an export is a one-off bulk read of up to
    // 1,000 events a page; storing those pages would push every small cached
    // answer out of the cache's 2 MB budget for nothing, and the user wants
    // what the relays hold now.
    const page = await ctx.queryRelaysWithConfidence(relays, filter, 6000, { cache: 'bypass' });
    complete = complete && page.complete;
    let added = 0;
    for (const event of page.events) {
      if (!byId.has(event.id)) added += 1;
      byId.set(event.id, event);
    }
    if (page.events.length === 0 || added === 0) break;
    until = Math.min(...page.events.map((event) => event.created_at)) - 1;
  }

  const packIdsByAuthor = new Map<string, Set<string>>();
  const favoriteEvents = Array.from(byId.values())
    .filter((event) => event.kind === KIND_EMOJI_FAVORITES)
    .sort((a, b) => b.created_at - a.created_at);
  for (const tag of favoriteEvents[0]?.tags ?? []) {
    if (tag[0] !== "a") continue;
    const [kind, author, ...identifierParts] = (tag[1] ?? "").split(":");
    if (kind !== "30030" || author.length !== 64 || !/^[0-9a-f]+/i.test(author) || identifierParts.length === 0) continue;
    const identifiers = packIdsByAuthor.get(author) ?? new Set<string>();
    identifiers.add(identifierParts.join(":"));
    packIdsByAuthor.set(author, identifiers);
  }

  const referencedById = new Map<string, NostrEvent>();
  for (const [author, identifiers] of packIdsByAuthor) {
    const filter: Filter = { kinds: [KIND_EMOJI_SET], authors: [author] };
    (filter as Record<string, unknown>)["#d"] = Array.from(identifiers);
    const result = await ctx.queryRelaysWithConfidence(relays, filter, 6000);
    complete = complete && result.complete;
    for (const event of result.events) referencedById.set(event.id, event);
  }

  return {
    pubkey,
    relays,
    events: Array.from(byId.values()).sort((a, b) => a.created_at - b.created_at),
    referencedMediaPackEvents: Array.from(referencedById.values()),
    complete,
  };
}
