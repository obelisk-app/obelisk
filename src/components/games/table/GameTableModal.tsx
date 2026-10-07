'use client';

import Modal from '@/components/ui/overlays/Modal';
import ChainReactionBoard from '../chain-reaction/ChainReactionBoard';
import GameOverOverlay from '../results/GameOverOverlay';
import { LazyStackerTable as StackerTable, LazyVestaTable as VestaTable } from './LazyTables';
import StartTableModal from '../start-table/StartTableModal';
import GameResults from '../results/GameResults';
import GameModalStatus from './GameModalStatus';
import GameRoster from './GameRoster';
import GameActionsBar from './GameActionsBar';
import { useGameTableModal } from '@/hooks/games/table/useGameTableModal';
import type { GameState } from 'vesta';
import { useTranslations } from 'next-intl';
import ErrorState from '@/components/ui/feedback/ErrorState';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Button from '@/components/ui/buttons/Button';
import { MaximizeIcon, MinimizeIcon } from '@/components/ui/icons/icons';
import { gameIcon, gameName } from '@/lib/games/core/catalog';

/**
 * The table itself: roster while waiting, board while playing, result when
 * done. Every button here publishes one event and then does nothing: the UI
 * updates when that event comes back off the relay, exactly like a chat
 * message. There is no optimistic local board, because a board the relay
 * hasn't accepted is a board the other players cannot see.
 *
 * The Vesta and Stacker tables come through `LazyTables`, so opening a Chain
 * Reaction table downloads no other game's code.
 */
export default function GameTableModal({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const t = useTranslations();
  const vm = useGameTableModal(gameId);
  const { session, myPubkey, mySeats, fullscreen } = vm;

  if (!session) {
    return (
      <Modal onClose={onClose} testId="game-modal" panelClassName="flex w-full max-w-md mx-4 flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-xl">
        <ModalHeader title={t('games.loadingTable')} onClose={onClose} />
        <div className="px-5 py-4">
          <div className="lc-skeleton h-40 w-full rounded-lg" />
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      onClose={onClose}
      testId="game-modal"
      panelClassName={
        fullscreen
          ? 'relative flex h-[100dvh] w-screen flex-col overflow-hidden bg-lc-dark'
          : 'relative flex max-h-[92vh] w-full max-w-3xl mx-4 flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-xl'
      }
    >
      {vm.seatPickerOpen && (
        <StartTableModal
          session={session}
          nameOf={vm.nameOf}
          onClose={vm.closeSeatPicker}
          onStart={vm.startWithSeats}
        />
      )}

      {vm.showSplash && (
        <GameOverOverlay
          session={session}
          myPubkey={myPubkey}
          nameOf={vm.nameOf}
          pictureOf={vm.pictureOf}
          onClose={onClose}
        />
      )}

      <ModalHeader
        title={<>{gameIcon(session.game)} {gameName(session.game)}</>}
        titleTestId="game-modal-title"
        subtitle={
          <GameModalStatus
            session={session}
            mySeats={mySeats}
            secondsLeft={vm.secondsLeft}
            nameOf={vm.nameOf}
            seatLabelFor={vm.seatLabelFor}
          />
        }
        onClose={onClose}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={vm.toggleFullscreen}
          aria-label={t(fullscreen ? 'games.header.exitFullscreen' : 'games.header.fullscreen')}
          data-testid="game-fullscreen"
        >
          {fullscreen ? <MinimizeIcon size={16} /> : <MaximizeIcon size={16} />}
        </Button>
      </ModalHeader>

      <div className={fullscreen ? 'flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3' : 'min-h-0 flex-1 overflow-y-auto px-5 py-4'}>
        <div className={fullscreen ? 'flex flex-1 flex-col justify-center' : undefined}>
          {session.status === 'waiting' || session.status === 'cancelled' ? (
            <GameRoster session={session} myPubkey={myPubkey} nameOf={vm.nameOf} pictureOf={vm.pictureOf} />
          ) : session.match ? (
            <StackerTable
              session={session}
              match={session.match}
              mySeats={mySeats}
              seatLabel={vm.seatLabelFor}
              onAttack={vm.onStackerAttack}
              onCheckpoint={vm.onStackerCheckpoint}
              onTopOut={vm.onStackerTopOut}
              fullscreen={fullscreen}
            />
          ) : session.game === 'vesta' ? (
            <VestaTable
              session={session}
              state={session.state as GameState}
              mySeats={mySeats}
              seatLabel={vm.seatLabelFor}
              onAction={vm.onSeatAction}
              busy={vm.busy}
            />
          ) : (
            // Deliberately the same element in the same place whether the table
            // is running or finished: swapping it for a results panel unmounted
            // the board mid-animation, so the winning explosion (the one worth
            // watching) was the one nobody ever saw.
            <ChainReactionBoard
              game={session}
              mySeats={mySeats}
              onAction={vm.onAction}
              maxWidth={vm.boardMaxWidth}
              maxHeight={vm.boardMaxHeight}
              seatLabel={vm.seatLabelFor}
              onRevealChange={vm.setBoardRevealing}
            />
          )}
        </div>

        {session.status === 'finished' && (
          <div className="mt-4">
            <GameResults session={session} seatLabel={vm.seatLabelFor} myPubkey={myPubkey} />
          </div>
        )}

        {vm.error && <ErrorState className="mt-3">{vm.error}</ErrorState>}
        <GameActionsBar
          session={session}
          myPubkey={myPubkey}
          mySeats={mySeats}
          busy={vm.busy}
          run={vm.run}
          onOpenSeatPicker={vm.openSeatPicker}
        />
      </div>
    </Modal>
  );
}
