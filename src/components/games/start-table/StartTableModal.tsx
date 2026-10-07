'use client';

import Modal from '@/components/ui/overlays/Modal';
import Input from '@/components/ui/forms/Input';
import type { GameSession } from '@/lib/games/session/session';
import type { SeatSpec } from '@/lib/games/protocol/protocol';
import { useTranslations } from 'next-intl';
import { useStartTableModal } from '@/hooks/games/start-table/useStartTableModal';
import Button from '@/components/ui/buttons/Button';
import Chip from '@/components/ui/data/Chip';
import { CloseIcon } from '@/components/ui/icons/icons';
import Text from '@/components/ui/layout/Text';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';

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
  const t = useTranslations();
  const vm = useStartTableModal(session, nameOf, onStart);

  return (
    <Modal
      onClose={onClose}
      testId="start-table-modal"
      panelClassName="w-full max-w-lg mx-4 rounded-xl border border-lc-border bg-lc-dark shadow-xl flex flex-col overflow-hidden max-h-[85vh]"
    >
      <ModalHeader title={t('games.seats')} subtitle={vm.subtitle} onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <ul className="space-y-2" data-testid="seat-list">
          {vm.rows.map(({ row, shared, chips, mode }, i) => (
            <li key={row.rowId} className="rounded-lg border border-lc-border p-2">
              <div className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-[11px] text-lc-muted">{i + 1}</span>
                <Input
                  variant="ghost"
                  size="xs"
                  value={row.label}
                  onChange={(e) => vm.rename(row.rowId, e.target.value)}
                  className="min-w-0 flex-1"
                  aria-label={t('games.startTable.seatName', { n: i + 1 })}
                />
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${
                    shared ? 'border-lc-green/60 text-lc-green' : 'border-lc-border text-lc-muted'
                  }`}
                  data-testid={`seat-mode-${i}`}
                >
                  {mode}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon" onClick={() => vm.move(i, -1)} aria-label={t('shell.desktop.layout.moveUp')}>↑</Button>
                  <Button variant="ghost" size="icon" onClick={() => vm.move(i, 1)} aria-label={t('shell.desktop.layout.moveDown')}>↓</Button>
                  {vm.canRemove && (
                    <Button
                      variant="ghost"
                      size="icon"
                      tone="danger"
                      onClick={() => vm.removeRow(row.rowId)}
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
                {chips.map((chip) => (
                  <Chip
                    key={chip.pubkey}
                    size="10"
                    state={chip.selected ? 'selected' : 'idle'}
                    disabled={chip.disabled}
                    onClick={() => vm.setController(row.rowId, chip.pubkey)}
                    data-testid={`seat-${i}-by-${chip.pubkey}`}
                  >
                    {nameOf(chip.pubkey)}
                  </Chip>
                ))}
              </div>

              {row.savedName && (
                <p className="mt-1 pl-7 text-[10px] text-lc-muted">
                  {t('games.startTable.takesOver', { name: row.savedName })}
                </p>
              )}
            </li>
          ))}
        </ul>

        {vm.canAdd && (
          <Button
            variant="outlinePill"
            size="xs"
            disabled={vm.addDisabled}
            onClick={vm.addRow} className="mt-3"
            data-testid="add-seat"
          >
            {t('games.startTable.addSeat')}
          </Button>
        )}
      </div>

      <ModalFooter
        meta={vm.meta}
        cancel={{ onClick: onClose }}
        actions={[{
          label: t('games.start'),
          onClick: vm.start,
          disabled: vm.startDisabled,
          tone: 'primary',
          testId: 'confirm-start',
        }]}
      />
    </Modal>
  );
}
