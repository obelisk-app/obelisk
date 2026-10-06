'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useMyPubkey } from '@/services/nostr-bridge';
import { useGamesStore } from '@/store/games';
import { turnSecondsLeft, seatsControlledBy } from '@/lib/games/session';
import { publishAttack, publishCheckpoint, publishStart, publishTopOut } from '@/services/games/transport';
import { useGameSession, useNowSeconds, useTurnClockEnforcer } from '@/hooks/chat/useChannelGames';
import ChainReactionBoard from './ChainReactionBoard';
import GameOverOverlay from './GameOverOverlay';
import VestaTable from './vesta/VestaTable';
import StackerTable from './stacker/StackerTable';
import StartTableModal from './StartTableModal';
import GameResults from './GameResults';
import GameModalHeader from './modal/GameModalHeader';
import GameRoster from './modal/GameRoster';
import GameActionsBar from './modal/GameActionsBar';
import { useGameLoad } from '@/hooks/chat/games/modal/useGameLoad';
import { useFullscreenBoardBox } from '@/hooks/chat/games/modal/useFullscreenBoardBox';
import { useResultSplash } from '@/hooks/chat/games/modal/useResultSplash';
import { useTableNames } from '@/hooks/chat/games/modal/useTableNames';
import { useGameActions } from '@/hooks/chat/games/modal/useGameActions';
import type { GameState } from 'vesta';
import { useTranslation } from '@/i18n/context';
import ErrorState from '@/components/ui/ErrorState';

/**
 * The table itself: roster while waiting, board while playing, result when
 * done. Every button here publishes one event and then does nothing: the UI
 * updates when that event comes back off the relay, exactly like a chat
 * message. There is no optimistic local board, because a board the relay
 * hasn't accepted is a board the other players cannot see.
 */
export default function GameModal({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const { t } = useTranslation();
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
      <Modal onClose={onClose} testId="game-modal" panelClassName="w-full max-w-md mx-4 rounded-xl bg-lc-dark border border-lc-border p-6">
        <div className="lc-skeleton h-40 w-full rounded-lg" />
        <p className="mt-3 text-center text-xs text-lc-muted">{t('games.loadingTable')}</p>
      </Modal>
    );
  }

  return (
    <Modal
      onClose={onClose}
      testId="game-modal"
      panelClassName={
        fullscreen
          ? 'relative flex h-[100dvh] w-screen flex-col overflow-y-auto bg-lc-dark p-3'
          : 'relative max-h-[92vh] w-full max-w-3xl mx-4 overflow-y-auto rounded-xl bg-lc-dark border border-lc-border p-5'
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

      <GameModalHeader
        session={session}
        mySeats={mySeats}
        secondsLeft={secondsLeft}
        nameOf={nameOf}
        seatLabelFor={seatLabelFor}
        fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen((v) => !v)}
        onClose={onClose}
      />

      <div className={fullscreen ? 'mt-3 flex flex-1 flex-col justify-center' : 'mt-4'}>
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
