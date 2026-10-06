'use client';

import Modal from '@/components/ui/Modal';
import { gameDescription, gameSummary } from '@/utils/chat/games/game-copy';
import { GameTypePreview } from './GamePreviews';
import { useTranslations } from 'next-intl';
import ErrorState from '@/components/ui/ErrorState';
import GamePickList from './new-game/GamePickList';
import GameSetupOptions from './new-game/GameSetupOptions';
import PlayersAndClock from './new-game/PlayersAndClock';
import { useNewGameForm } from '@/hooks/chat/games/new-game/useNewGameForm';
import Button from '@/components/ui/Button';

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
      panelClassName="w-full max-w-md mx-4 rounded-xl bg-lc-dark border border-lc-border p-5"
    >
      {!selected ? (
        <GamePickList onChoose={choose} onClose={onClose} />
      ) : (
        <>
          <div className="flex items-start gap-3">
            <GameTypePreview type={selected.type} size={44} icon={selected.icon} />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-lc-white" data-testid="config-title">
                {selected.icon} {selected.displayName}
              </h2>
              <p className="text-[11px] text-lc-muted">{gameDescription(t, selected.type)}</p>
            </div>
          </div>

          <GameSetupOptions form={form} />
          <PlayersAndClock form={form} />

          <p className="mt-3 text-[11px] text-lc-muted">
            {t(localPlayers > 0 ? 'games.newGame.everyoneHere' : 'games.newGame.hostSeated', {
              summary: gameSummary(t, selected),
            })}
          </p>

          {error && <ErrorState className="mt-3">{error}</ErrorState>}

          <div className="mt-5 flex justify-between">
            <Button
              variant="pillSecondary"
              size="xs"
              onClick={() => setSelected(null)}
              data-testid="game-back"
            >
              {t('common.back')}
            </Button>
            <Button
              variant="pill"
              size="xs"
              onClick={create}
              disabled={busy}
              data-testid="game-create"
            >
              {t(busy ? 'games.newGame.creating' : localPlayers > 0 ? 'games.newGame.startPlaying' : 'games.newGame.createTable')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
