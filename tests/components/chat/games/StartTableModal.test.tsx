import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameSession } from '@/lib/games/session';
import StartTableModal from '@/components/chat/games/StartTableModal';
import { LocaleProvider } from '@tests/support/intl';

/** The seat picker wears the shared modal header and footer. */
function waitingTable(): GameSession {
  return {
    id: 'table-1', channelId: 'channel-1', game: 'chain-reaction', status: 'waiting',
    createdBy: 'pk-ana', createdAt: 1_760_000_000, opts: {}, turnTimeoutS: 45,
    minPlayers: 2, maxPlayers: 8,
    participants: ['pk-ana', 'pk-bruno'], seats: [], joined: ['pk-ana', 'pk-bruno'],
    state: null, currentTurn: null, turnIndex: 0, turnStartedAt: null, turnDeadline: null,
    winner: null, draw: false, eliminated: [], finishedAt: null, match: null,
  } as unknown as GameSession;
}

describe('StartTableModal chrome', () => {
  it('titles the dialog, counts the seats in the footer and starts from there', () => {
    const onClose = vi.fn();
    const onStart = vi.fn();
    render(
      <LocaleProvider initialLocale="en">
        <StartTableModal session={waitingTable()} nameOf={(pk) => pk} onClose={onClose} onStart={onStart} />
      </LocaleProvider>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Seats and turn order' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2–8 seats')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-start'));
    expect(onStart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
