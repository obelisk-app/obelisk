/**
 * Publishing game ops to the channel's relay: one resilient publish that
 * survives a half-open socket, an echo into our own log, and the recovery
 * of a table whose confirmation was lost. Re-exported from `transport.ts`.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_GAME } from '@/utils/nip-kinds';
import { ingestGameEvent } from './ingest';
import {
  buildCreate,
  buildGameOp,
  parseGameEvent,
  type GameEvent,
  type SeatSpec,
} from '@/lib/games/protocol';
import { bridge, GAME_SUB_WATCHDOG_MS } from './transport-bridge';

/**
 * Publish, and try once more if the confirmation never came back.
 *
 * The relay closes connections on a five minute timer (`max_connection_duration`
 * and `idle_timeout` in its config, and its logs are full of `Broken pipe`
 * writing to sockets that already went away). A client holding a long-lived
 * socket does not necessarily notice: the EVENT goes into a half-open
 * connection, no OK comes back, and nostr-tools times the publish out. Open
 * the app, sit in a channel for a few minutes, then start a game - that is the
 * shape of it.
 *
 * The first failure is what makes the dead socket observable, so a second
 * attempt lands on a fresh one. Anything that is not a timeout - a real
 * refusal, with a reason - is passed straight through, because retrying a
 * rejection just annoys the relay twice.
 *
 * Whatever comes back is also fed straight into our own store. See {@link echo}.
 */
async function publishResilient(
  template: { kind: number; content: string; tags: string[][] },
): Promise<NostrEvent> {
  const b = await bridge();
  try {
    return echo(await b.publishEvent(template));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!looksLikeLostConfirmation(message)) throw err;

    // Retrying on the same pooled connection is pointless: SimplePool hands
    // back the same relay object, and if that socket is half-open the second
    // attempt dies exactly like the first. Drop it, so `publishEvent` opens a
    // fresh one, then ask again.
    b.dropRelayConnection();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return echo(await b.publishEvent(template));
  }
}

/**
 * Ingest an event we just published, without waiting for the relay to echo it.
 *
 * A publisher used to sit and look at its own skeleton: create a table, and the
 * card stayed a spinner until the relay sent the kind 2390 back to us. There is
 * nothing to wait for - this is the same signed event, with the same id, that
 * every other client will replay, so putting it in the log now is not an
 * optimistic guess. The relay's copy arrives later and the dedupe eats it.
 *
 * Tolerant of anything unparseable on purpose: a signer or a test stub that
 * hands back a partial event must not break the publish it just completed.
 */
function echo(ev: NostrEvent): NostrEvent {
  const parsed = parseGameEvent(ev as GameEvent);
  if (parsed) ingestGameEvent(parsed);
  return ev;
}

/**
 * Create a table. Resolves with the table id (the create event's id).
 *
 * A publish that times out has NOT necessarily failed. The relay's OK travels
 * back over the same socket the EVENT went out on, and that socket can be gone
 * by the time it would arrive - the public relay closes connections on a five
 * minute timer, and its logs are full of `Broken pipe` while writing to sockets
 * that already went away. The event is stored; only the confirmation is lost.
 *
 * Telling the user "the relay rejected this" in that situation is wrong twice
 * over: the table exists, and they are told it doesn't. So a timeout sends us
 * looking for the event we just published - matched by a nonce we put in it  - 
 * before we give up on it.
 */
export async function publishCreate(
  channelId: string,
  params: { game: string; opts?: Record<string, unknown>; turnTimeoutS: number },
): Promise<string> {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const template = buildCreate(channelId, { ...params, nonce });

  try {
    const ev = await publishResilient(template);
    return ev.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!looksLikeLostConfirmation(message)) throw err;

    const recovered = await findCreateByNonce(channelId, nonce);
    if (recovered) return recovered;
    throw new Error(
      'The relay never confirmed the table. It may still appear in a moment; '
      + `check the channel before creating another. (${message})`,
    );
  }
}

/** A lost OK looks like a timeout, not like a refusal with a reason. */
export function looksLikeLostConfirmation(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('timed out') || m.includes('timeout') || m.includes('no relay accepted');
}

/**
 * Look for a create event we published but never got confirmation for.
 * Matched on the nonce, so it cannot pick up somebody else's table or an
 * earlier one of ours.
 */
export async function findCreateByNonce(
  channelId: string,
  nonce: string,
  waitMs = 4000,
): Promise<string | null> {
  const b = await bridge();
  const me = b.getPublicKey();
  if (!me) return null;

  return new Promise<string | null>((resolve) => {
    let done = false;
    const finish = (id: string | null) => {
      if (done) return;
      done = true;
      unsub();
      clearTimeout(timer);
      resolve(id);
    };

    const unsub = b.subscribeFilterWatched(
      { kinds: [KIND_GAME], authors: [me], since: Math.floor(Date.now() / 1000) - 120 },
      (ev) => {
        const parsed = parseGameEvent(ev as GameEvent);
        if (!parsed || parsed.op !== 'create') return;
        if (parsed.channelId !== channelId || parsed.nonce !== nonce) return;
        // The publish whose OK went missing did land. Put it in the log before
        // handing the id back, so the card the caller is about to post a marker
        // for has something to render.
        ingestGameEvent(parsed);
        finish(parsed.gameId);
      },
      { watchdogMs: GAME_SUB_WATCHDOG_MS },
    );

    const timer = setTimeout(() => finish(null), waitMs);
  });
}

export async function publishJoin(channelId: string, gameId: string): Promise<void> {
  await publishResilient(buildGameOp(channelId, gameId, 'join'));
}

export async function publishStart(
  channelId: string,
  gameId: string,
  seats: readonly SeatSpec[],
): Promise<void> {
  await publishResilient(buildGameOp(channelId, gameId, 'start', { seats }));
}

export async function publishMove(
  channelId: string,
  gameId: string,
  n: number,
  action: unknown,
  /** Which seat is being played. Required when the signer holds several. */
  seat?: string,
): Promise<void> {
  await publishResilient(buildGameOp(channelId, gameId, 'move', {
    n,
    action,
    ...(seat ? { seat } : {}),
  }));
}

/** Garbage from one seat to another, in a real-time match. */
export async function publishAttack(
  channelId: string,
  gameId: string,
  payload: { seat: string; target: string; lines: number; hole: number; nonce: number },
): Promise<void> {
  await publishResilient(buildGameOp(channelId, gameId, 'attack', payload));
}

/** "I'm out" - the only event that removes a player from a real-time match. */
export async function publishTopOut(channelId: string, gameId: string, seat: string): Promise<void> {
  await publishResilient(buildGameOp(channelId, gameId, 'topout', { seat }));
}

/**
 * Progress plus the input log that produced it. The log is what makes the
 * claims checkable - see `verifyCheckpoint`.
 */
export async function publishCheckpoint(
  channelId: string,
  gameId: string,
  payload: {
    seat: string;
    frame: number;
    attacksSent: number;
    linesCleared: number;
    stackHeight: number;
    /** Only on the slower verification cadence. */
    inputs?: string;
    /** The visible well, for opponents to watch. */
    board?: string;
  },
): Promise<void> {
  await publishResilient(buildGameOp(channelId, gameId, 'checkpoint', payload));
}

export async function publishTimeout(channelId: string, gameId: string, n: number): Promise<void> {
  await publishResilient(buildGameOp(channelId, gameId, 'timeout', { n }));
}

export async function publishResign(
  channelId: string,
  gameId: string,
  /** Which seat is giving up. Required when the signer holds several. */
  seat?: string | null,
): Promise<void> {
  await publishResilient(buildGameOp(channelId, gameId, 'resign', seat ? { seat } : {}));
}

export async function publishCancel(channelId: string, gameId: string): Promise<void> {
  await publishResilient(buildGameOp(channelId, gameId, 'cancel'));
}
