'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useConnectionState } from '@/lib/nostr-bridge';
import { useGamesStore, selectChannelSessions, selectSession } from '@/store/games';
import { subscribeChannelGames, publishTimeout } from '@/lib/games/transport';
import { ingestGameEvent } from '@/lib/games/ingest';
import { useNowSeconds } from '@/lib/games/clock';
import { controllerOf, isTurnExpired, seatsControlledBy, type GameSession } from '@/lib/games/session';

export { useNowSeconds };

/**
 * Subscribe to the active channel's game log. One sub per channel, on the
 * active relay only (the transport enforces that) — a table belongs to the
 * channel it was created in, and following a user across relays would open
 * sockets to relays they haven't authenticated against.
 */
export function useChannelGamesSubscription(channelId: string | null): void {
  useEffect(() => {
    if (!channelId) return;
    let unsub: (() => void) | null = null;
    let cancelled = false;

    // Batched, not per-event: the backfill for a channel that plays a lot is
    // hundreds of events arriving across a socket drain, and one store update
    // each meant one replay per event per visible card. See lib/games/ingest.
    void subscribeChannelGames(channelId, ingestGameEvent).then((fn) => {
      if (cancelled) { fn(); return; }
      unsub = fn;
    }).catch((err) => {
      console.warn('[games] subscription failed', err);
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [channelId]);
}

/**
 * How often session derivation re-runs against the wall clock. See
 * `useGameSession` — this is not the turn clock, which ticks every second.
 */
export const SESSION_CLOCK_MS = 30_000;

/**
 * One table, replayed from its log. `null` until the create event lands.
 *
 * Subscribes to **this table's log**, not to the whole map. That matters more
 * than it looks: while this selected `s.logs`, every ingest anywhere produced a
 * new map object, which re-rendered every mounted card and re-derived every
 * table. A channel with a dozen cards and a live match in it spent its frame
 * budget replaying tables nobody was looking at.
 *
 * The clock stays coarse for the same reason. `now` decides exactly one thing —
 * whether a table nobody started has gone stale after an hour — and
 * `selectSession` caches the replay by log identity, so a tick now costs a
 * `WeakMap` lookup and an integer compare rather than a full replay.
 */
export function useGameSession(gameId: string | null): GameSession | null {
  const log = useGamesStore((s) => (gameId ? s.logs[gameId] : undefined));
  const now = useNowSeconds(SESSION_CLOCK_MS);
  return useMemo(
    () => (gameId && log ? selectSession({ logs: { [gameId]: log } }, gameId, now) : null),
    [log, gameId, now],
  );
}

/** Every table in a channel, newest first. */
export function useChannelSessions(channelId: string | null): GameSession[] {
  const logs = useGamesStore((s) => s.logs);
  const channelOf = useGamesStore((s) => s.channelOf);
  const now = useNowSeconds(SESSION_CLOCK_MS);
  return useMemo(
    () => (channelId ? selectChannelSessions({ logs, channelOf }, channelId, now) : []),
    [logs, channelOf, channelId, now],
  );
}

/**
 * Grace between a deadline passing and this client being willing to say so.
 *
 * Two things it absorbs. A move already in flight — signed, published, not yet
 * echoed back — should land before anybody reports its author. And our clock
 * is not their clock: the reducer accepts a claim whose `created_at` is past
 * the deadline, and `created_at` comes from whoever claims, so a browser
 * running a few seconds fast would otherwise cut turns short for everyone
 * else at the table.
 */
export const TIMEOUT_CLAIM_GRACE_S = 3;

/**
 * How long this client waits after (re)connecting before it claims anything.
 *
 * A turn clock derived from the log keeps running while the relay is
 * unreachable, so the moment a table comes back everyone's deadline has
 * already passed — through nobody's fault. Claiming then would hand the win
 * to whoever reconnected first. Instead we give the player on move the same
 * window on a healthy relay that the clock was supposed to give them.
 */
export const RECONNECT_CLAIM_GRACE_S = 20;

/**
 * Publish the timeout claim when the clock runs out on someone else's turn.
 *
 * Somebody has to say it out loud — the deadline is derivable from the log,
 * but a state transition only exists once it is an event. Every client at the
 * table races to publish; the reducer accepts exactly one (first by
 * `created_at`, then by id), so the duplicates are harmless noise.
 *
 * Only clients watching the table claim, and never against their own turn:
 * losing on time should cost you a move you didn't make, not a move your own
 * browser reported you for. And never on a connection that only just came
 * back — see `RECONNECT_CLAIM_GRACE_S`.
 */
export function useTurnClockEnforcer(
  session: GameSession | null,
  myPubkey: string | null,
  enabled: boolean,
): void {
  const now = useNowSeconds();
  const connection = useConnectionState();
  const connected = connection === 'Connected';
  // A ref, not state: "we already claimed this turn" is bookkeeping for the
  // effect, and nothing renders differently because of it. Re-rendering on
  // every claim would just be a cascade.
  const claimed = useRef<string | null>(null);
  // When this client's socket last came up. Null while it is down, so a
  // disconnected tab cannot report anybody for a turn it could not have seen.
  const connectedSince = useRef<number | null>(null);

  useEffect(() => {
    if (!connected) {
      connectedSince.current = null;
      return;
    }
    if (connectedSince.current === null) {
      connectedSince.current = Math.floor(Date.now() / 1000);
    }
  }, [connected]);

  useEffect(() => {
    if (!enabled || !session || !myPubkey || !session.currentTurn) return;
    if (session.status !== 'in_progress') return;
    // Seats, not pubkeys: on a hot-seat table one account holds several seats,
    // and comparing a pubkey to a seat id would have this client reporting
    // its own players for running out the clock.
    if (seatsControlledBy(session, myPubkey).length === 0) return;
    if (controllerOf(session, session.currentTurn) === myPubkey) return;
    if (!isTurnExpired(session, now - TIMEOUT_CLAIM_GRACE_S)) return;

    if (!connected) return;
    const since = connectedSince.current;
    if (since === null || now - since < RECONNECT_CLAIM_GRACE_S) return;

    const key = `${session.id}:${session.turnIndex}`;
    if (claimed.current === key) return;
    claimed.current = key;
    publishTimeout(session.channelId, session.id, session.turnIndex).catch((err) => {
      console.warn('[games] timeout claim failed', err);
    });
  }, [enabled, session, myPubkey, now, connected]);
}
