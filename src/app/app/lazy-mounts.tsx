'use client';

import { lazy, Suspense, type ComponentProps } from 'react';
import type VoiceRoomComponent from '@/components/voice/VoiceRoom';
import type NewGameModalComponent from '@/components/chat/games/NewGameModal';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import { useGamesStore } from '@/store/games';
import { useTranslation } from '@/i18n/context';
import { useDmCallListener } from '@/hooks/useDmCallListener';

/**
 * The heavy features, loaded only when they are used.
 *
 * Voice pulls in `mediasoup-client` and the whole voice client, a game table
 * pulls in the board renderers, and the DM call layer pulls in the call view.
 * Imported statically, all of it rode in the shell's own download, so every
 * user paid for voice and games on first load whether or not they ever
 * opened one. Each one here is a separate download fetched the first time it
 * is drawn, and each shows a placeholder shaped like what replaces it, so
 * nothing jumps when it arrives.
 *
 * `tests/app/app/lazy-mounts.test.ts` fails if either shell imports one of
 * these modules directly again.
 */

const VoiceRoom = lazy(() => import('@/components/voice/VoiceRoom'));
const GameModalHost = lazy(() =>
  import('@/components/chat/games/GameModal').then((m) => ({ default: m.GameModalHost })),
);
const NewGameModal = lazy(() => import('@/components/chat/games/NewGameModal'));
const DmCallLayer = lazy(() =>
  import('@/components/call/DmCallLayer').then((m) => ({ default: m.DmCallLayer })),
);

/** Fills the stage the room will occupy, so the layout does not shift when it lands. */
function VoiceRoomLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center" data-testid="voice-room-loading">
      <Spinner size="lg" label={t('common.loading')} />
    </div>
  );
}

/** The same skeleton panel `GameModal` shows while its table loads, so the swap is seamless. */
function ModalLoading({ onClose, label }: { onClose: () => void; label?: string }) {
  return (
    <Modal
      onClose={onClose}
      testId="lazy-modal-loading"
      panelClassName="w-full max-w-md mx-4 rounded-xl bg-lc-dark border border-lc-border p-6"
    >
      <div className="lc-skeleton h-40 w-full rounded-lg" />
      {label && <p className="mt-3 text-center text-xs text-lc-muted">{label}</p>}
    </Modal>
  );
}

export function LazyVoiceRoom(props: ComponentProps<typeof VoiceRoomComponent>) {
  return (
    <Suspense fallback={<VoiceRoomLoading />}>
      <VoiceRoom {...props} />
    </Suspense>
  );
}

/** Downloads the game table only once a game is opened. */
export function LazyGameModalHost() {
  const { t } = useTranslation();
  const openGameId = useGamesStore((s) => s.openGameId);
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  if (!openGameId) return null;
  return (
    <Suspense fallback={<ModalLoading onClose={() => setOpenGame(null)} label={t('games.loadingTable')} />}>
      <GameModalHost />
    </Suspense>
  );
}

export function LazyNewGameModal(props: ComponentProps<typeof NewGameModalComponent>) {
  return (
    <Suspense fallback={<ModalLoading onClose={props.onClose} />}>
      <NewGameModal {...props} />
    </Suspense>
  );
}

/**
 * Listens for incoming calls from the moment the shell mounts: the listener
 * ships with the shell, so an invite never waits on this download (nor on
 * the media stack, which loads only when a call starts or rings). The layer
 * draws nothing until a call starts, so it needs no placeholder.
 */
export function LazyDmCallLayer() {
  useDmCallListener();
  return (
    <Suspense fallback={null}>
      <DmCallLayer />
    </Suspense>
  );
}
