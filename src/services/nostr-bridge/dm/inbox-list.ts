/**
 * Our own NIP-17 inbox list (kind 10050): published when missing, stale, or
 * no longer naming the relay we listen on, to the NIP-65 union without
 * NIP-42. Pure move from `dm/relays.ts`.
 */
import { parseInboxRelayList, parseRelayList } from '@nostr-wot/data';
import { KIND_DM_INBOX_RELAYS, KIND_RELAY_LIST } from '@/constants/nostr/nip-kinds';
import { getPreferences } from '@/services/preferences/preferences';
import { newestEvent } from '../profile/profile-sync-cache';
import { PROFILE_RELAYS } from '@/constants/nostr-bridge/profile';
import { isImportableRelayUrl, uniqueRelayUrls } from '../relay/relay-list';
import type { DmRelaysContext, DmRelaysDeps } from './relays';

export interface InboxListDeps extends DmRelaysDeps {
  /** Our own DM relays discovered this session, read live. */
  mine(): readonly string[];
}

/**
 * Publish our own kind-10050 NIP-17 inbox list if we don't have one yet,
 * or the one on the relays no longer matches the relay(s) we're actually
 * listening on. Best-effort, fire-and-forget from `finalizeLogin`, a
 * failure here just means senders fall back to our NIP-65 relays (or
 * their own default set) the way `fetchInboxRelays` already documents,
 * not a broken login.
 *
 * Advertises `ctx.relays()` (the relay(s) `subscribeIncomingDMs` actually
 * listens on) as the inbox. Obelisk is single-active-relay-per-session
 * today, so this is one relay in practice; if that changes, this call
 * site is the one place that needs to widen.
 *
 * ### Where it goes, and why not everywhere
 *
 * A kind-10050 is *meant* to be public, that is the whole point of an
 * inbox list, so breadth is not objectionable in itself. What was
 * objectionable was the AUTH: this publish used to target
 * `ctx.relays() ∪ PROFILE_RELAYS` with the default auth signer attached, so
 * any of those relays could reply `auth-required:` and be handed the user's
 * real pubkey on a socket they never chose to open. Two changes:
 *
 * - **Target set.** CLAUDE.md's relay table puts DM traffic on the NIP-65
 *   read+write union, so that is what this publishes to (plus the active
 *   relay, which is what the list advertises, plus whatever the previous
 *   list named so a replaceable-event update actually overwrites the copy
 *   senders will read). The union is derived from the same query that
 *   checks for an existing list, kinds `[10002, 10050]` in one REQ, so
 *   there is no extra round-trip and no race against `fetchMine`.
 * - **`authMode: 'never'`.** The event is self-signed and public; no relay
 *   needs to know who opened the socket in order to store it. A relay that
 *   insists on AUTH simply doesn't get a copy. The active relay is already
 *   authenticated from ordinary browsing, so the list always lands
 *   somewhere.
 *
 * The one case where breadth is re-added is a user with no NIP-65 list at
 * all: the union collapses to the active relay, and a sender looking us up
 * from elsewhere would have nowhere to find the list. There we fall back to
 * the profile relays, still without AUTH, so the cost is zero.
 */
export async function ensureInboxPublished(ctx: DmRelaysContext, deps: InboxListDeps): Promise<void> {
  // Same opt-in gate as `subscribeIncomingDMs`, don't advertise a NIP-17
  // inbox for a feature the user has turned off locally.
  if (!getPreferences().directMessagesEnabled) return;
  const session = ctx.session();
  if (!session) return;
  const me = session.pubKeyHex;
  const STALE_MS = 7 * 24 * 3600 * 1000;
  try {
    const searchRelays = Array.from(new Set([...ctx.relays(), ...PROFILE_RELAYS]));
    // Bypass the result cache: this read decides whether to publish over
    // what it finds, so it must be the wire's newest list, and its answer is
    // stale once the publish below lands.
    const { events } = await ctx.queryRelaysWithConfidence(
      searchRelays,
      { kinds: [KIND_DM_INBOX_RELAYS, KIND_RELAY_LIST], authors: [me] },
      4000,
      { cache: 'bypass' },
    );
    const newest = newestEvent(events.filter((e) => e.kind === KIND_DM_INBOX_RELAYS));
    const newestNip65 = newestEvent(events.filter((e) => e.kind === KIND_RELAY_LIST));
    const desired = Array.from(new Set(ctx.relays()));
    const current = newest ? parseInboxRelayList(newest, 'public') : [];
    const matches = current.length === desired.length && desired.every((r) => current.includes(r));
    const isStale = !newest || Date.now() - newest.created_at * 1000 > STALE_MS;
    if (matches && !isStale) return;
    // Session may have changed (logout/switch) while the query was in flight.
    if (ctx.session()?.pubKeyHex !== me) return;
    const signer = deps.dmSigner();
    if (!signer) return;
    const event = await signer.signEvent({
      kind: KIND_DM_INBOX_RELAYS,
      created_at: Math.floor(Date.now() / 1000),
      content: '',
      tags: desired.map((url) => ['relay', url]),
    });
    // NIP-65 read+write union, the CLAUDE.md scope for DM-related traffic.
    const nip65 = newestNip65 ? parseRelayList(newestNip65, 'public') : { read: [], write: [] };
    const union = uniqueRelayUrls([
      ...desired,
      ...deps.mine(),
      ...nip65.read.filter(isImportableRelayUrl),
      ...nip65.write.filter(isImportableRelayUrl),
      // Wherever the previous list claimed to live, so this replacement
      // supersedes it instead of leaving a stale copy for senders to read.
      ...current.filter(isImportableRelayUrl),
    ]);
    const targets = union.length > desired.length
      ? union
      : uniqueRelayUrls([...desired, ...PROFILE_RELAYS]);
    await deps.publishSignedEvent(event, targets, { quiet: true, authMode: 'never' });
  } catch {
    // best-effort, a missing/stale inbox list degrades NIP-17
    // reachability, it doesn't break anything else.
  }
}
