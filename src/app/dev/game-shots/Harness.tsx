'use client';

import Button from '@/components/ui/buttons/Button';
import { useState } from 'react';
import type { GameState as VestaState } from 'vesta';
import ChainReactionBoard from '@/components/games/chain-reaction/ChainReactionBoard';
import VestaTable from '@/components/games/vesta/VestaTable';
import VestaBoard from '@/components/games/vesta/VestaBoard';
import StackerTable from '@/components/games/stacker/StackerTable';
import StackerBoard from '@/components/games/stacker/StackerBoard';
import GameResults from '@/components/games/results/GameResults';
import NewGameModal from '@/components/games/new-game/NewGameModal';
import { seatLabel } from '@/utils/games/shots/fixtures';
import { useHarness } from '@/hooks/games/shots/useHarness';
import Frame from './Frame';

/**
 * Every surface the game guides show, mounted from fixture logs.
 *
 * One `data-shot` per screenshot. `scripts/snap-game-shots.mjs` finds those
 * attributes, waits for `[data-shots-ready]`, and captures each element - so
 * adding a picture to a guide is adding a `<Shot>` here, not a new script.
 */

export default function Harness() {
  const { cr, crSeats, crDone, vesta, vestaSeats, stacker, still, noop } = useHarness();
  // The picker is a modal: it paints over the page, so it renders only when
  // the snapshot script asks for it.
  const [picker, setPicker] = useState(false);

  return (
    <div className="min-h-screen bg-lc-black" data-shots-ready="true">
      {/* The dev-tools badge is a real element in the corner of the page and
          lands inside a full-page screenshot. Nothing else needs it hidden. */}
      <style>{'nextjs-portal { display: none !important; }'}</style>
      <Button
        variant="bare"
        type="button"
        data-open-picker
        onClick={() => setPicker(true)}
        className="fixed bottom-2 right-2 z-10 rounded-full border border-lc-border px-3 py-1 text-xs text-lc-muted"
      >
        picker
      </Button>

      {/* The three games in one landscape frame, for the /features page. */}
      <Frame name="games-feature" width={1180}>
        <div className="flex items-center justify-center gap-7">
          <ChainReactionBoard
            game={cr}
            mySeats={crSeats}
            onAction={noop}
            maxWidth={300}
            maxHeight={420}
            seatLabel={seatLabel}
          />
          {/* The Vesta board is a fixed-size canvas, so it is scaled and
              scaled rather than re-rendered smaller. */}
          <div style={{ width: 469, height: 363, overflow: 'hidden' }}>
            <div style={{ transform: 'scale(0.625)', transformOrigin: 'top left' }}>
              <VestaBoard state={vesta.state as VestaState} mode="none" />
            </div>
          </div>
          <StackerBoard runner={still} cell={17} />
        </div>
      </Frame>

      <Frame name="chain-reaction-board" width={420}>
        <ChainReactionBoard
          game={cr}
          mySeats={crSeats}
          onAction={noop}
          maxWidth={360}
          seatLabel={seatLabel}
        />
      </Frame>

      {/* Not a guide shot - this is here to eyeball the fullscreen board, which
          sizes itself from the room it is given rather than a fixed cell cap. */}
      <Frame name="chain-reaction-fullscreen" width={1200}>
        <ChainReactionBoard
          game={cr}
          mySeats={crSeats}
          onAction={noop}
          maxWidth={1168}
          maxHeight={690}
          seatLabel={seatLabel}
        />
      </Frame>

      <Frame name="chain-reaction-result" width={380}>
        <GameResults session={crDone} seatLabel={seatLabel} myPubkey="pk-ana" />
      </Frame>

      <Frame name="vesta-board" width={860}>
        <VestaTable
          session={vesta}
          state={vesta.state as VestaState}
          mySeats={vestaSeats}
          seatLabel={seatLabel}
          onAction={noop}
        />
      </Frame>

      <Frame name="stacker-well" width={340}>
        <div className="flex justify-center">
          {/* A still frame (`stillRunner`): nothing is running here on purpose. */}
          <StackerBoard runner={still} cell={22} />
        </div>
      </Frame>

      <Frame name="stacker-table" width={760}>
        <StackerTable
          session={stacker.session}
          match={stacker.match}
          mySeats={['seat-ana']}
          seatLabel={seatLabel}
          onAttack={() => {}}
          onCheckpoint={() => {}}
          onTopOut={() => {}}
        />
      </Frame>

      {picker && (
        <NewGameModal
          channelId="obelisk-guides-channel"
          onClose={() => setPicker(false)}
          onPostMarker={() => {}}
        />
      )}
    </div>
  );
}
