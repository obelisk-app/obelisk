'use client';

import Modal from '@/components/ui/overlays/Modal';
import { gameDescription, gameSummary } from '@/utils/games/copy/game-copy';
import { GameTypePreview } from './GamePreviews';
import { useTranslations } from 'next-intl';
import ErrorState from '@/components/ui/feedback/ErrorState';
import GamePickList from './GamePickList';
import GameSetupOptions from './GameSetupOptions';
import PlayersAndClock from './PlayersAndClock';
import { useNewGameForm } from '@/hooks/games/new-game/useNewGameForm';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';

/**
 * Pick a game, set it up, open the table.
 *
 * Two steps, like the classic stack's picker: a list of what is playable with
 * a thumbnail each, then that game's own options. Everything shown comes from
 * the catalog keyed by game type; no screen hardcodes a game's name, which is
 * how a Vesta table used to end up captioned "Chain Reaction".
 *
 * Creating publishes the `create` event and then posts the `[[game:<id>]]`
 * marker as a chat message. Nobody is seated here beyond the host: who plays,
 * and which seats are local, is decided at `start` (see StartTableModal),
 * because until people have joined there is nobody to seat.
 */
export default function NewGameModal({
  channelId,
  onClose,
  onPostMarker,
}: {
  channelId: string;
  onClose: () => void;
  /** Posts the in-channel card. Given the table id once the relay accepts it. */
  onPostMarker: (marker: string) => void;
}) {
  const t = useTranslations();
  const form = useNewGameForm({ channelId, onClose, onPostMarker });
  const { selected, setSelected, choose, localPlayers, busy, error, create } = form;

  return (
    <Modal
      onClose={onClose}
      testId="new-game-modal"
      panelClassName="w-full max-w-md mx-4 rounded-xl border border-lc-border bg-lc-dark shadow-xl flex flex-col overflow-hidden max-h-[85vh]"
    >
      {!selected ? (
        <>
          <ModalHeader title={t('games.pick')} onClose={onClose} />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <GamePickList onChoose={choose} />
          </div>
          <ModalFooter cancel={{ onClick: onClose }} />
        </>
      ) : (
        <>
          <ModalHeader
            icon={<GameTypePreview type={selected.type} size={44} icon={selected.icon} />}
            decorativeIcon={false}
            title={<>{selected.icon} {selected.displayName}</>}
            titleTestId="config-title"
            subtitle={gameDescription(t, selected.type)}
            onClose={onClose}
          />

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <GameSetupOptions form={form} />
            <PlayersAndClock form={form} />

            <p className="mt-3 text-[11px] text-lc-muted">
              {t(localPlayers > 0 ? 'games.newGame.everyoneHere' : 'games.newGame.hostSeated', {
                summary: gameSummary(t, selected),
              })}
            </p>

            {error && <ErrorState className="mt-3">{error}</ErrorState>}
          </div>

          <ModalFooter
            cancel={{ onClick: () => setSelected(null), label: t('common.back'), testId: 'game-back' }}
            actions={[{
              label: t(busy ? 'games.newGame.creating' : localPlayers > 0 ? 'games.newGame.startPlaying' : 'games.newGame.createTable'),
              onClick: create,
              disabled: busy,
              tone: 'primary',
              testId: 'game-create',
            }]}
          />
        </>
      )}
    </Modal>
  );
}
