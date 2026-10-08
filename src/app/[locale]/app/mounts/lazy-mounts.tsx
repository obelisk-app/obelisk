'use client';

import { lazy, Suspense, type ComponentProps } from 'react';
import type NewGameModalComponent from '@/components/games/new-game/NewGameModal';
import Modal from '@/components/ui/overlays/Modal';
import { useGamesStore } from '@/store/games';
import { useTranslations } from 'next-intl';
import { useDmCallListener } from '@/hooks/call/useDmCallListener';
import Text from '@/components/ui/layout/Text';
import Skeleton from '@/components/ui/animations/Skeleton';

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

const GameModalHost = lazy(() =>
  import('@/components/games/table/GameModal').then((m) => ({ default: m.GameModalHost })),
);
const NewGameModal = lazy(() => import('@/components/games/new-game/NewGameModal'));
const DmCallLayer = lazy(() =>
  import('@/components/call/DmCallLayer').then((m) => ({ default: m.DmCallLayer })),
);

/** The same skeleton panel `GameModal` shows while its table loads, so the swap is seamless. */
function ModalLoading({ onClose, label }: { onClose: () => void; label?: string }) {
  return (
    <Modal
      onClose={onClose}
      testId="lazy-modal-loading"
      panelClassName="w-full max-w-md mx-4 rounded-xl bg-lc-dark border border-lc-border p-6"
    >
      <Skeleton className="h-40 w-full rounded-lg" />
      {label && <Text as="p" variant="caption" className="mt-3 text-center">{label}</Text>}
    </Modal>
  );
}

/** Downloads the game table only once a game is opened. */
export function LazyGameModalHost() {
  const t = useTranslations();
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
