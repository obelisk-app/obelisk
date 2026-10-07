'use client';

import { useState } from 'react';
import Modal from '@/components/ui/overlays/Modal';
import { useMyPubkey } from '@/services/nostr-bridge';
import { useGamesStore } from '@/store/games';
import { turnSecondsLeft, seatsControlledBy } from '@/lib/games/session/session';
import { publishAttack, publishCheckpoint, publishStart, publishTopOut } from '@/services/games/transport';
import { useGameSession, useNowSeconds, useTurnClockEnforcer } from '@/hooks/games/channel/useChannelGames';
import ChainReactionBoard from '../chain-reaction/ChainReactionBoard';
import GameOverOverlay from '../results/GameOverOverlay';
import { LazyStackerTable as StackerTable, LazyVestaTable as VestaTable } from './LazyTables';
import StartTableModal from '../start-table/StartTableModal';
import GameResults from '../results/GameResults';
import GameModalStatus from './GameModalStatus';
import GameRoster from './GameRoster';
import GameActionsBar from './GameActionsBar';
import { useGameLoad } from '@/hooks/games/table/useGameLoad';
import { useFullscreenBoardBox } from '@/hooks/games/table/useFullscreenBoardBox';
import { useResultSplash } from '@/hooks/games/table/useResultSplash';
import { useTableNames } from '@/hooks/games/table/useTableNames';
import { useGameActions } from '@/hooks/games/table/useGameActions';
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
 */
export default function GameModal({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const t = useTranslations();
  const session = useGameSession(gameId);
  const myPubkey = useMyPubkey();
  const now = useNowSeconds();
  const [seatPickerOpen, setSeatPickerOpen] = useState(false);
  // Phones get fullscreen by default: a 20-row well plus rails does not fit
  // in a dialog on a handset, and the board was being cut off top and bottom.
  const [fullscreen, setFullscreen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );

  useGameLoad(gameId, session);
  const boardBox = useFullscreenBoardBox(fullscreen);
  const { showSplash, setBoardRevealing } = useResultSplash(gameId, session?.status === 'finished', session?.finishedAt);

  // Every client watching a table helps enforce its clock.
  useTurnClockEnforcer(session, myPubkey, true);

  const { nameOf, seatLabelFor, pictureOf } = useTableNames(session);
  const { busy, error, run, onAction, onSeatAction } = useGameActions(session);

  const secondsLeft = session ? turnSecondsLeft(session, now) : null;
  const mySeats = session ? seatsControlledBy(session, myPubkey) : [];

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
      {seatPickerOpen && (
        <StartTableModal
          session={session}
          nameOf={nameOf}
          onClose={() => setSeatPickerOpen(false)}
          onStart={(seats) => {
            setSeatPickerOpen(false);
            void run(() => publishStart(session.channelId, session.id, seats));
          }}
        />
      )}

      {showSplash && (
        <GameOverOverlay
          session={session}
          myPubkey={myPubkey}
          nameOf={nameOf}
          pictureOf={pictureOf}
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
            secondsLeft={secondsLeft}
            nameOf={nameOf}
            seatLabelFor={seatLabelFor}
          />
        }
        onClose={onClose}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setFullscreen((v) => !v)}
          aria-label={t(fullscreen ? 'games.header.exitFullscreen' : 'games.header.fullscreen')}
          data-testid="game-fullscreen"
        >
          {fullscreen ? <MinimizeIcon size={16} /> : <MaximizeIcon size={16} />}
        </Button>
      </ModalHeader>

      <div className={fullscreen ? 'flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3' : 'min-h-0 flex-1 overflow-y-auto px-5 py-4'}>
        <div className={fullscreen ? 'flex flex-1 flex-col justify-center' : undefined}>
          {session.status === 'waiting' || session.status === 'cancelled' ? (
            <GameRoster session={session} myPubkey={myPubkey} nameOf={nameOf} pictureOf={pictureOf} />
          ) : session.match ? (
            <StackerTable
              session={session}
              match={session.match}
              mySeats={mySeats}
              seatLabel={seatLabelFor}
              onAttack={(seat, target, lines, hole, nonce) => {
                // Fire and forget: a dropped attack must never stall the board.
                publishAttack(session.channelId, session.id, { seat, target, lines, hole, nonce })
                  .catch((err) => console.warn('[stacker] attack failed to publish', err));
              }}
              onCheckpoint={(seat, payload) => {
                publishCheckpoint(session.channelId, session.id, { seat, ...payload })
                  .catch((err) => console.warn('[stacker] checkpoint failed to publish', err));
              }}
              onTopOut={(seat) => {
                publishTopOut(session.channelId, session.id, seat)
                  .catch((err) => console.warn('[stacker] topout failed to publish', err));
              }}
              fullscreen={fullscreen}
            />
          ) : session.game === 'vesta' ? (
            <VestaTable
              session={session}
              state={session.state as GameState}
              mySeats={mySeats}
              seatLabel={seatLabelFor}
              onAction={onSeatAction}
              busy={busy}
            />
          ) : (
            // Deliberately the same element in the same place whether the table
            // is running or finished: swapping it for a results panel unmounted
            // the board mid-animation, so the winning explosion (the one worth
            // watching) was the one nobody ever saw.
            <ChainReactionBoard
              game={session}
              mySeats={mySeats}
              onAction={onAction}
              maxWidth={boardBox?.width ?? 420}
              maxHeight={boardBox?.height}
              seatLabel={seatLabelFor}
              onRevealChange={setBoardRevealing}
            />
          )}
        </div>

        {session.status === 'finished' && (
          <div className="mt-4">
            <GameResults session={session} seatLabel={seatLabelFor} myPubkey={myPubkey} />
          </div>
        )}

        {error && <ErrorState className="mt-3">{error}</ErrorState>}
        <GameActionsBar
          session={session}
          myPubkey={myPubkey}
          mySeats={mySeats}
          busy={busy}
          run={run}
          onOpenSeatPicker={() => setSeatPickerOpen(true)}
        />
      </div>
    </Modal>
  );
}

/** Mounts the modal for whatever table the store says is open. */
export function GameModalHost() {
  const openGameId = useGamesStore((s) => s.openGameId);
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  if (!openGameId) return null;
  return <GameModal gameId={openGameId} onClose={() => setOpenGame(null)} />;
}
