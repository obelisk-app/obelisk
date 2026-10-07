'use client';

import { useTranslations } from 'next-intl';
import type { GameSession } from '@/lib/games/session/session';
import type { SeatSpec } from '@/lib/games/protocol/protocol';
import { gameInfo, gameName } from '@/lib/games/core/catalog';
import { useSeatRows } from '@/hooks/games/start-table/useSeatRows';
import { seatFooterMeta, seatModeLabel, seatRowViews } from '@/utils/games/start-table/seat-row-view';

/**
 * The seat picker's view model: the editable rows (from `useSeatRows`), each
 * with how it will be played and which accounts may take it, the dialog's
 * help line and footer, and `start`.
 */
export function useStartTableModal(
  session: GameSession,
  nameOf: (pubkey: string) => string,
  onStart: (seats: SeatSpec[]) => void,
) {
  const t = useTranslations();
  // Real-time games give every player their own board, running at the same
  // time, so an account can hold exactly one seat. Hot-seat is meaningless
  // there: you cannot pass a keyboard between people who are all playing.
  const realtime = gameInfo(session.game)?.realtime === true;
  const {
    rows, savedPlayers, seats, seatsFor, setController, rename, addRow, removeRow, move,
    tooFew, tooMany, wrongForSave,
  } = useSeatRows(session, nameOf);

  const subtitle = realtime
    ? t('games.startTable.realtimeHelp', { game: gameName(session.game) })
    : savedPlayers
      ? t('games.startTable.resumeHelp', { game: gameName(session.game), count: savedPlayers.length })
      : t('games.startTable.assignHelp');

  return {
    subtitle,
    rows: seatRowViews(rows, session.joined, seatsFor, realtime).map((view) => ({
      ...view,
      mode: seatModeLabel(t, realtime, view.shared, nameOf(view.row.by)),
    })),
    canRemove: !savedPlayers && rows.length > session.minPlayers,
    canAdd: !savedPlayers && !realtime,
    addDisabled: rows.length >= session.maxPlayers,
    meta: seatFooterMeta(
      t,
      { rows: rows.length, min: session.minPlayers, max: session.maxPlayers, saved: savedPlayers?.length ?? null },
      { tooFew, tooMany, wrongForSave },
    ),
    startDisabled: tooFew || tooMany || wrongForSave,
    start: () => onStart(seats),
    setController,
    rename,
    addRow,
    removeRow,
    move,
  };
}
