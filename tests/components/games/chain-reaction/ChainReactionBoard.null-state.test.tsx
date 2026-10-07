import '@tests/support/game-engines';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChainReactionBoard from '@/components/games/chain-reaction/ChainReactionBoard';
import type { GameSession } from '@/lib/games/session/session';
import { LocaleProvider } from '@tests/support/intl';

/**
 * An in-progress table whose state has not been read yet (the rules engine
 * is still downloading) draws the empty default grid. That grid used to be a
 * new array on every render, and the cascade reveal reset its state to it on
 * every effect run, so the board re-rendered forever.
 */
describe('ChainReactionBoard without a state yet', () => {
  it('settles on the empty grid instead of re-rendering forever', () => {
    const game = { status: 'in_progress', state: null, currentTurn: 'a', seats: ['a', 'b'] } as unknown as GameSession;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <LocaleProvider initialLocale="en">
        <ChainReactionBoard game={game} mySeats={['a']} onAction={async () => {}} />
      </LocaleProvider>,
    );
    expect(error.mock.calls.flat().join(' ')).not.toMatch(/Maximum update depth/);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(54);
    error.mockRestore();
  }, 10_000);
});
