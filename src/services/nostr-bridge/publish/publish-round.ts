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
 *
 * `publishRoundSettling` is the round a user waits on: it stops waiting
 * once a relay accepted and every other target either answered or is down.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';
import type { PublishAuthMode, PublishResult, RelayHub } from '@nostr-wot/relay/hub';
import type { PublishResults } from './publish-results';
import { PUBLISH_STRAGGLER_GRACE_MS, PUBLISH_TIMED_OUT } from '@/constants/nostr-bridge/publish';

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

/**
 * {@link publishRound}, but the caller stops waiting as soon as one relay
 * accepted and every target still pending is down: its socket is not up
 * and its last connect attempt failed. The hub waits out such a relay's
 * whole ack window (it keeps retrying a socket other REQs want, so the wait
 * never fails early), which held a profile save on a relay answering
 * HTTP 502 after every live relay had said OK. A target that is up but
 * slow gets {@link PUBLISH_STRAGGLER_GRACE_MS} past the first acceptance.
 * The hub's own round carries on in the background either way; a target
 * cut short reads `unreachable` (down) or timed out (slow).
 */
export function publishRoundSettling(
  hub: Pick<RelayHub, 'publish' | 'status' | 'onStatus'>,
  targets: readonly string[],
  event: NostrEvent,
  authMode: PublishAuthMode,
): Promise<PublishResults> {
  const keys = Array.from(new Set(targets.map(keyOf)));
  const rows = new Map<string, PublishResult>();
  const isDown = (url: string) => {
    const status = hub.status(url);
    return status.connection !== 'connected' && status.lastError !== null;
  };
  return new Promise((resolve, reject) => {
    let done = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    let stopWatching: () => void = () => {};
    const finish = () => {
      if (done) return;
      done = true;
      if (grace) clearTimeout(grace);
      stopWatching();
      const all = keys.map((url): PublishResult => rows.get(url) ?? (isDown(url)
        ? { url, status: 'unreachable', reason: `relay ${url} unreachable (${hub.status(url).lastError})` }
        : { url, status: 'timeout', reason: null }));
      resolve(settledFor(targets, all));
    };
    const check = () => {
      if (done) return;
      const pending = keys.filter((url) => !rows.has(url));
      if (pending.length === 0) return finish();
      if (!Array.from(rows.values()).some((row) => row.status === 'ok')) return;
      if (pending.every(isDown)) return finish();
      grace ??= setTimeout(finish, PUBLISH_STRAGGLER_GRACE_MS);
    };
    stopWatching = hub.onStatus((status) => {
      if (keys.includes(status.url)) check();
    });
    hub.publish({
      relays: targets,
      event,
      authMode,
      onResult: (row) => {
        rows.set(row.url, row);
        check();
      },
    }).then((all) => {
      for (const row of all) rows.set(row.url, row);
      finish();
    }, (error: unknown) => {
      if (done) return;
      done = true;
      if (grace) clearTimeout(grace);
      stopWatching();
      reject(error);
    });
  });
}
