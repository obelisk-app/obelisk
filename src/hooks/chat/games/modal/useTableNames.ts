'use client';

import { useCallback } from 'react';
import { useGroupMemberInfo } from '@/services/nostr-bridge';
import type { GameSession } from '@/lib/games/session';
import { seatDisplayLabel } from '@/lib/games/seat-label';

/** Names and pictures for the people and seats at one table. */
export function useTableNames(session: GameSession | null | undefined) {
  const memberList = useGroupMemberInfo(session?.channelId ?? null);

  /**
   * A person's name: the same string for everybody looking.
   *
   * Deliberately NOT "you" for the current user: this feeds the seat labels
   * that get published in the `start` event, and a viewer-relative word there
   * is written into shared state. It was, and every other player at the table
   * saw a player called "Vos".
   *
   * Marking which seat is yours is a rendering job, done per viewer.
   */
  const nameOf = useCallback(
    (pubkey: string) => memberList.find((m) => m.pubkey === pubkey)?.displayName ?? pubkey.slice(0, 8),
    [memberList],
  );

  // A seat can carry its own name: that is how two people sharing one
  // account show up as two players rather than twice as the same person.
  const seatLabelFor = useCallback((seatId: string) => {
    const seat = session?.seats.find((s2) => s2.id === seatId);
    // Tables created before this was fixed carry a literal "Vos" as somebody's
    // name. `seatDisplayLabel` treats those as absent and falls back to the
    // profile, so nobody is shown a name that means "you" about someone else.
    return seatDisplayLabel(seat?.label, nameOf(seat?.by ?? seatId));
  }, [session, nameOf]);

  const pictureOf = useCallback(
    (pubkey: string) => memberList.find((m) => m.pubkey === pubkey)?.picture ?? null,
    [memberList],
  );

  return { nameOf, seatLabelFor, pictureOf };
}
