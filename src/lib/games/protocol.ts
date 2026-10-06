/**
 * Wire format for Obelisk games on Nostr.
 *
 * The classic stack ran games on a Postgres row plus a socket.io broadcast:
 * the server validated a move, mutated `game.state`, and pushed the new board
 * to everyone. There is no server here, so the *log is the game*. Every
 * create / join / start / move / timeout / resign / cancel is one signed kind
 * 2390 event on the channel's relay, and each client replays the log through
 * the pure engine (`session.ts`) to rebuild the identical board.
 *
 * This mirrors how voice signaling works (`src/services/voice/transport.ts`):
 * plaintext signed events, addressed by tags, gated in the handler rather
 * than trusted from the relay. The differences are deliberate:
 *
 *   - stored kind, not ephemeral - a spectator joining at move 40 must be
 *     able to replay moves 1-39;
 *   - `["h", channelId]` NIP-29 group scoping, so the relay applies the same
 *     write policy it applies to chat: only people who may post in the
 *     channel may play in it;
 *   - a turn index `n` on every move, so two clients that disagree about
 *     wall-clock still agree about move order.
 *
 * Authority model: nobody. A client that publishes an illegal move just
 * publishes garbage - every other client re-validates through
 * `validateAction` and drops it. What a malicious client CAN do is refuse to
 * publish its own losing move; the turn clock (`timeout`) is the answer to
 * that, and it is enforced by every player, not by a referee.
 */
import { KIND_GAME } from '@/utils/nip-kinds';
import type { GameOp } from './protocol-types';

export type { GameEvent, GameOp, ParsedGameEvent, SeatSpec } from './protocol-types';
export { parseGameEvent, parseSeats } from './protocol-parse';

export const GAME_TAG = 'obelisk-game';

/** How long a `waiting` table stays joinable before clients call it stale. */
export const WAITING_EXPIRY_MINUTES = 60;

/** History window for the channel subscription. Older tables are dead anyway. */
export const GAME_LOG_WINDOW_SECONDS = 24 * 60 * 60;

/** Seat id for the nth extra seat a pubkey holds. Seat 0 is the pubkey itself. */
export function localSeatId(pubkey: string, n: number): string {
  return n === 0 ? pubkey : `${pubkey}#${n}`;
}

/** Template for a `create` - the event id it lands with becomes the table id. */
export function buildCreate(channelId: string, params: {
  game: string;
  opts?: Record<string, unknown>;
  turnTimeoutS: number;
  /**
   * Client-chosen id for this attempt. It exists so a publish whose
   * confirmation never came back can be looked up afterwards: the relay may
   * well have stored the event while the OK was lost with the socket. See
   * `publishCreate`.
   */
  nonce?: string;
}) {
  return {
    kind: KIND_GAME,
    content: JSON.stringify({
      game: params.game,
      opts: params.opts ?? {},
      turnTimeoutS: params.turnTimeoutS,
      ...(params.nonce ? { nonce: params.nonce } : {}),
    }),
    tags: [
      ['h', channelId],
      ['t', GAME_TAG],
      ['op', 'create'],
      ['game', params.game],
    ],
  };
}

/** Template for any op that references an existing table. */
export function buildGameOp(
  channelId: string,
  gameId: string,
  op: Exclude<GameOp, 'create'>,
  payload: Record<string, unknown> = {},
) {
  const tags: string[][] = [
    ['h', channelId],
    ['t', GAME_TAG],
    ['op', op],
    ['e', gameId, '', 'root'],
  ];
  // `n` is duplicated into a tag so a client can filter a long log down to a
  // single turn without parsing every content blob.
  if (typeof payload.n === 'number') tags.push(['n', String(payload.n)]);
  return { kind: KIND_GAME, content: JSON.stringify(payload), tags };
}


/** Marker posted as a kind 9 chat message so the table shows up in the channel. */
export const GAME_MARKER_REGEX = /\[\[game:([0-9a-f]{64})\]\]/g;

export function gameMarker(gameId: string): string {
  return `[[game:${gameId}]]`;
}

/** All table ids referenced by a chat message body, in order, deduped. */
export function extractGameMarkers(content: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of content.matchAll(GAME_MARKER_REGEX)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push(m[1]);
  }
  return out;
}
