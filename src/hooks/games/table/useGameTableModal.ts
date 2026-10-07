'use client';

import { useState } from 'react';
import { useMyPubkey } from '@/services/nostr-bridge';
import { turnSecondsLeft, seatsControlledBy } from '@/lib/games/session/session';
import type { SeatSpec } from '@/lib/games/protocol/protocol';
import { publishStart } from '@/services/games/transport';
import { sendStackerAttack, sendStackerCheckpoint, sendStackerTopOut, type StackerCheckpoint } from '@/services/games/stacker-relay';
import { useGameSession, useNowSeconds, useTurnClockEnforcer } from '@/hooks/games/channel/useChannelGames';
import { useGameLoad } from '@/hooks/games/table/useGameLoad';
import { useFullscreenBoardBox } from '@/hooks/games/table/useFullscreenBoardBox';
import { useResultSplash } from '@/hooks/games/table/useResultSplash';
import { useTableNames } from '@/hooks/games/table/useTableNames';
import { useGameActions } from '@/hooks/games/table/useGameActions';
import { opensFullscreen } from '@/utils/games/table/fullscreen-default';
import { DIALOG_BOARD_WIDTH } from '@/constants/games/table';

/**
 * The table's view model: the replayed session and who is looking, the
 * fullscreen and seat-picker toggles, the result splash, names, and every
 * publish the table can make. Every publish sends one event and then does
 * nothing: the UI updates when that event comes back off the relay.
 */
export function useGameTableModal(gameId: string) {
  const session = useGameSession(gameId);
  const myPubkey = useMyPubkey();
  const now = useNowSeconds();
  const [seatPickerOpen, setSeatPickerOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(opensFullscreen);

  useGameLoad(gameId, session);
  const boardBox = useFullscreenBoardBox(fullscreen);
  const { showSplash, setBoardRevealing } = useResultSplash(gameId, session?.status === 'finished', session?.finishedAt);

  // Every client watching a table helps enforce its clock.
  useTurnClockEnforcer(session, myPubkey, true);

  const { nameOf, seatLabelFor, pictureOf } = useTableNames(session);
  const { busy, error, run, onAction, onSeatAction } = useGameActions(session);

  return {
    session,
    myPubkey,
    mySeats: session ? seatsControlledBy(session, myPubkey) : [],
    secondsLeft: session ? turnSecondsLeft(session, now) : null,
    fullscreen,
    toggleFullscreen: () => setFullscreen((v) => !v),
    boardMaxWidth: boardBox?.width ?? DIALOG_BOARD_WIDTH,
    boardMaxHeight: boardBox?.height,
    seatPickerOpen,
    openSeatPicker: () => setSeatPickerOpen(true),
    closeSeatPicker: () => setSeatPickerOpen(false),
    /** The seat picker's start: close it, then publish the seats. */
    startWithSeats: (seats: SeatSpec[]) => {
      setSeatPickerOpen(false);
      if (session) void run(() => publishStart(session.channelId, session.id, seats));
    },
    showSplash,
    setBoardRevealing,
    nameOf,
    seatLabelFor,
    pictureOf,
    busy,
    error,
    run,
    onAction,
    onSeatAction,
    onStackerAttack: (seat: string, target: string, lines: number, hole: number, nonce: number) => {
      if (session) sendStackerAttack(session, seat, target, lines, hole, nonce);
    },
    onStackerCheckpoint: (seat: string, payload: StackerCheckpoint) => {
      if (session) sendStackerCheckpoint(session, seat, payload);
    },
    onStackerTopOut: (seat: string) => {
      if (session) sendStackerTopOut(session, seat);
    },
  };
}
