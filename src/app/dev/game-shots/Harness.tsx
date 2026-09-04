'use client';

import { useMemo, useState } from 'react';
import type { GameState as VestaState } from 'vesta';
import ChainReactionBoard from '@/components/chat/games/ChainReactionBoard';
import VestaTable from '@/components/chat/games/vesta/VestaTable';
import StackerTable from '@/components/chat/games/stacker/StackerTable';
import StackerBoard from '@/components/chat/games/stacker/StackerBoard';
import type { StackerRunner } from '@/lib/games/stacker/runner';
import GameResults from '@/components/chat/games/GameResults';
import NewGameModal from '@/components/chat/games/NewGameModal';
import {
  chainReactionFixture,
  finishedChainReaction,
  seatLabel,
  stackerFixture,
  stackerWell,
  vestaFixture,
} from './fixtures';

/**
 * Every surface the game guides show, mounted from fixture logs.
 *
 * One `data-shot` per screenshot. `scripts/snap-game-shots.mjs` finds those
 * attributes, waits for `[data-shots-ready]`, and captures each element — so
 * adding a picture to a guide is adding a `<Shot>` here, not a new script.
 */

const noop = async () => {};

function Frame({ name, width, children }: { name: string; width: number; children: React.ReactNode }) {
  return (
    <section className="p-6">
      <div
        data-shot={name}
        className="rounded-xl border border-lc-border bg-lc-dark p-4"
        style={{ width }}
      >
        {children}
      </div>
    </section>
  );
}

export default function Harness() {
  const cr = useMemo(() => chainReactionFixture(), []);
  const crDone = useMemo(() => finishedChainReaction(), []);
  const vesta = useMemo(() => vestaFixture(), []);
  const stacker = useMemo(() => stackerFixture(), []);
  // A paused well: everything `StackerBoard` reads off a runner, none of what
  // it does. The cast is the harness admitting it is not a real match.
  const still = useMemo(() => {
    const state = stackerWell();
    return {
      state,
      onFrame: (listener: (s: typeof state) => void) => {
        listener(state);
        return () => {};
      },
    } as unknown as StackerRunner;
  }, []);
  // The picker is a modal: it paints over the page, so it renders only when
  // the snapshot script asks for it.
  const [picker, setPicker] = useState(false);

  return (
    <div className="min-h-screen bg-lc-black" data-shots-ready="true">
      {/* The dev-tools badge is a real element in the corner of the page and
          lands inside a full-page screenshot. Nothing else needs it hidden. */}
      <style>{'nextjs-portal { display: none !important; }'}</style>
      <button
        type="button"
        data-open-picker
        onClick={() => setPicker(true)}
        className="fixed bottom-2 right-2 z-10 rounded-full border border-lc-border px-3 py-1 text-xs text-lc-muted"
      >
        picker
      </button>

      <Frame name="chain-reaction-board" width={420}>
        <ChainReactionBoard
          game={cr}
          mySeats={[cr.currentTurn ?? 'seat-ana']}
          onAction={noop}
          maxWidth={360}
          seatLabel={seatLabel}
        />
      </Frame>

      {/* Not a guide shot — this is here to eyeball the fullscreen board, which
          sizes itself from the room it is given rather than a fixed cell cap. */}
      <Frame name="chain-reaction-fullscreen" width={1200}>
        <ChainReactionBoard
          game={cr}
          mySeats={[cr.currentTurn ?? 'seat-ana']}
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
          mySeats={[vesta.currentTurn ?? 'seat-ana']}
          seatLabel={seatLabel}
          onAction={noop}
        />
      </Frame>

      <Frame name="stacker-well" width={340}>
        <div className="flex justify-center">
          {/* The board draws whatever its runner hands it and never asks the
              runner for anything else, so a still frame is a state plus an
              `onFrame` that fires once. Nothing is running here on purpose. */}
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
