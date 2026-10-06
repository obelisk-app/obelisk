/**
 * One publish round through the hub (`hub.publish`), read back in the shape
 * the publish path's result readers take (`publish-results.ts`): one
 * settled result per target relay, in target order, so `results[i]` is
 * `targetRelays[i]`'s answer.
 *
 * The hub reports one row per distinct relay; this maps each target onto
 * its row by normalized URL. A target that repeats an earlier one (after
 * normalization) is answered `duplicate url`, as nostr-tools' pool did.
 * A row maps as: `ok` fulfilled with the relay's message; `timeout`
 * rejected with `publish timed out` (the words the timed-out-everywhere
 * retry looks for); `rejected` and `unreachable` rejected with the reason.
 * An unreachable relay is a refusal, not an acceptance: the old pool
 * resolved a connection failure as a string, so it counted as accepted.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';
import type { PublishAuthMode, PublishResult, RelayHub } from '@/lib/relay-hub';
import type { PublishResults } from './publish-results';

export const PUBLISH_TIMED_OUT = 'publish timed out';

function keyOf(url: string): string {
  try {
    return normalizeURL(url);
  } catch {
    return url; // the hub reports an invalid URL under the raw string
  }
}

function settledOf(row: PublishResult | undefined): PromiseSettledResult<string> {
  if (!row) return { status: 'rejected', reason: new Error('no result') };
  if (row.status === 'ok') return { status: 'fulfilled', value: row.reason ?? '' };
  if (row.status === 'timeout') return { status: 'rejected', reason: new Error(PUBLISH_TIMED_OUT) };
  return { status: 'rejected', reason: new Error(row.reason ?? row.status) };
}

export function settledFor(targets: readonly string[], rows: readonly PublishResult[]): PublishResults {
  const seen = new Set<string>();
  return targets.map((target) => {
    const key = keyOf(target);
    if (seen.has(key)) return { status: 'rejected', reason: new Error('duplicate url') };
    seen.add(key);
    return settledOf(rows.find((r) => r.url === key));
  });
}

/**
 * Publish `event` to `targets` and read the rows back per target.
 * `ackTimeoutMs` is the hub's per-relay wait for the socket and the OK
 * (default 4000 ms, 750 ms for an ephemeral kind).
 */
export async function publishRound(
  hub: Pick<RelayHub, 'publish'>,
  targets: readonly string[],
  event: NostrEvent,
  authMode: PublishAuthMode,
  ackTimeoutMs?: number,
): Promise<PublishResults> {
  const rows = await hub.publish({
    relays: targets,
    event,
    authMode,
    ...(ackTimeoutMs !== undefined ? { ackTimeoutMs } : {}),
  });
  return settledFor(targets, rows);
}
