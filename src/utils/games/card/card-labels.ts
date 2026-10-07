/**
 * What the in-channel game card says about its table: the action on its
 * pill, the status line, the seat dots, and the winner's name.
 */
import { canJoin, controllerOf, type GameSession } from '@/lib/games/session/session';
import { seatDisplayLabel } from '@/lib/games/core/seat-label';
import { SEAT_COLORS } from '@/constants/games/chain-reaction';
import type { Translate } from '@/i18n/keys';

/** The pill on the right: join an open table, else open it or read its result. */
export function cardActionLabel(t: Translate, session: GameSession, myPubkey: string | null): string {
  if (canJoin(session, myPubkey)) return t('games.join');
  return t(session.status === 'finished' ? 'games.card.result' : 'games.card.open');
}

/**
 * The status line. `winner` is set, and `text` is null, only when the line
 * names somebody else's win: that name needs the channel's member list, which
 * only a card with a winner should subscribe to.
 */
export function cardStatus(
  t: Translate,
  session: GameSession,
  myPubkey: string | null,
): { text: string; winner: null } | { text: null; winner: string } {
  const text = (value: string) => ({ text: value, winner: null });
  switch (session.status) {
    case 'waiting':
      return text(t('games.card.openTable', { joined: session.joined.length, max: session.maxPlayers }));
    case 'in_progress':
      return text(t('games.inProgress'));
    case 'finished':
      if (session.draw || !session.winner) return text(t('games.draw'));
      // Naming the reader is safe here: this is rendered per viewer and never
      // published, unlike the seat labels that travel in the `start` event.
      if (controllerOf(session, session.winner) === myPubkey) return text(t('games.card.youWon'));
      return { text: null, winner: session.winner };
    default:
      return text(t('games.cancelled'));
  }
}

/** One coloured dot per seat, as far as there are seat colours. */
export function cardSeatDots(session: GameSession): Array<{ pubkey: string; hex: string | undefined }> {
  const seats = session.status === 'waiting' ? session.joined : session.participants;
  return seats.slice(0, SEAT_COLORS.length).map((pubkey, i) => ({ pubkey, hex: SEAT_COLORS[i]?.hex }));
}

/**
 * The winner's name. `winner` is a SEAT id, which on a hot-seat table is
 * `pubkey#1`, and looking that up in the member list misses and leaves a
 * mangled hex prefix on screen. The controller is the person; the label is
 * what the table chose to call the seat.
 */
export function winnerName(
  session: GameSession,
  winner: string,
  members: ReadonlyArray<{ pubkey: string; displayName?: string | null }>,
): string {
  const controller = controllerOf(session, winner);
  const profileName = members.find((m) => m.pubkey === controller)?.displayName
    ?? controller.slice(0, 8);
  return seatDisplayLabel(session.seats.find((s) => s.id === winner)?.label, profileName);
}
