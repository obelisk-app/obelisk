'use client';

import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import type { GameSession } from '@/lib/games/session';
import type { SeatSpec } from '@/lib/games/protocol';
import { gameInfo, gameName } from '@/lib/games/catalog';
import { useTranslation } from '@/i18n/context';
import { useSeatRows } from '@/hooks/chat/games/start-table/useSeatRows';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import { CloseIcon } from '@/components/ui/icons';
import Text from '@/components/ui/Text';

/**
 * The host's last decision before a table starts: who plays which seat, and
 * from where.
 *
 * There is exactly one control that matters per seat (**which account signs
 * its moves**), and everything else follows from it:
 *
 *   - an account holding one seat plays it **remotely**, from their own
 *     client, with their own key;
 *   - an account holding several is playing them **on one machine**: the
 *     hot-seat case. They are still separate players with separate resources;
 *     they just share a keyboard and a signature.
 *
 * When the table is resuming a save, the rows are fixed: one per player in the
 * saved game, in the save's own order, showing the name that player had. Seat
 * order is player order, so row 1 inherits saved player 1's board. That
 * mapping used to be implicit in the row order and unexplained; now the host
 * assigns each saved player to an account on purpose.
 */
export default function StartTableModal({
  session,
  nameOf,
  onClose,
  onStart,
}: {
  session: GameSession;
  nameOf: (pubkey: string) => string;
  onClose: () => void;
  onStart: (seats: SeatSpec[]) => void;
}) {
  const { t } = useTranslation();
  // Real-time games give every player their own board, running at the same
  // time, so an account can hold exactly one seat. Hot-seat is meaningless
  // there: you cannot pass a keyboard between people who are all playing.
  const realtime = gameInfo(session.game)?.realtime === true;
  const {
    rows, savedPlayers, seats, seatsFor, setController, rename, addRow, removeRow, move,
    tooFew, tooMany, wrongForSave,
  } = useSeatRows(session, nameOf);

  return (
    <Modal
      onClose={onClose}
      testId="start-table-modal"
      panelClassName="w-full max-w-lg mx-4 rounded-xl bg-lc-dark border border-lc-border p-5 max-h-[85vh] overflow-y-auto"
    >
      <h2 className="text-sm font-semibold text-lc-white">{t('games.seats')}</h2>
      <p className="mt-1 text-[11px] text-lc-muted">
        {realtime
          ? `Every player needs their own device: ${gameName(session.game)} runs all the boards at once, so one seat per account.`
          : savedPlayers
            ? `Resuming a saved ${gameName(session.game)} game with ${savedPlayers.length} players. Assign each one to an account: several seats on the same account are played at that person's keyboard.`
            : 'Assign each seat to an account. Give one account several seats and those players share that machine; one seat each means everyone plays from their own client.'}
      </p>

      <ul className="mt-4 space-y-2" data-testid="seat-list">
        {rows.map((row, i) => {
          const shared = seatsFor(row.by) > 1;
          return (
            <li key={row.rowId} className="rounded-lg border border-lc-border p-2">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-[11px] text-lc-muted">{i + 1}</span>
                <Input
                  variant="ghost"
                  size="xs"
                  value={row.label}
                  onChange={(e) => rename(row.rowId, e.target.value)}
                  className="min-w-0 flex-1"
                  aria-label={`Seat ${i + 1} name`}
                />
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${
                    shared ? 'border-lc-green/60 text-lc-green' : 'border-lc-border text-lc-muted'
                  }`}
                  data-testid={`seat-mode-${i}`}
                >
                  {realtime ? 'own device' : shared ? `on ${nameOf(row.by)}'s machine` : 'remote'}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon" onClick={() => move(i, -1)} aria-label={t('desktop.layout.moveUp')}>↑</Button>
                  <Button variant="ghost" size="icon" onClick={() => move(i, 1)} aria-label={t('desktop.layout.moveDown')}>↓</Button>
                  {!savedPlayers && rows.length > session.minPlayers && (
                    <Button
                      variant="ghost"
                      size="icon"
                      tone="danger"
                      onClick={() => removeRow(row.rowId)}
                      aria-label={t('games.removeSeat')}
                    >
                      <CloseIcon size={14} />
                    </Button>
                  )}
                </div>
              </div>

              {/* Who signs for this seat */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-7">
                <Text size="10" variant="label" tone="muted">{t('games.playedBy')}</Text>
                {session.joined.map((pubkey) => (
                  <Chip
                    key={pubkey}
                    size="10"
                    state={row.by === pubkey ? 'selected' : 'idle'}
                    disabled={realtime && row.by !== pubkey && seatsFor(pubkey) > 0}
                    onClick={() => setController(row.rowId, pubkey)}
                    data-testid={`seat-${i}-by-${pubkey}`}
                  >
                    {nameOf(pubkey)}
                  </Chip>
                ))}
              </div>

              {row.savedName && (
                <p className="mt-1 pl-7 text-[10px] text-lc-muted">
                  Takes over “{row.savedName}” from the save
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {!savedPlayers && !realtime && (
        <Button
          variant="outlinePill"
          size="xs"
          disabled={rows.length >= session.maxPlayers}
          onClick={addRow} className="mt-3"
          data-testid="add-seat"
        >
          + add a seat
        </Button>
      )}

      <p className="mt-3 text-[11px] text-lc-muted">
        {rows.length} of {session.minPlayers}–{session.maxPlayers} seats
        {tooFew && ' · needs more players'}
        {tooMany && ' · too many'}
        {wrongForSave && ` · the save has ${savedPlayers!.length}`}
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="pillSecondary" size="xs" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="pill"
          size="xs"
          disabled={tooFew || tooMany || wrongForSave}
          onClick={() => onStart(seats)}
          data-testid="confirm-start"
        >
          {t('games.start')}
        </Button>
      </div>
    </Modal>
  );
}
