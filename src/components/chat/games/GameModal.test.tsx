import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { GameSession } from '@/lib/games/session';

/**
 * The result splash and the winning cascade.
 *
 * The deciding move is the biggest chain in the game, and it arrives in the
 * same event that ends the match — so a splash rendered the instant the log
 * says "finished" covers the one explosion anybody wanted to watch. The modal
 * holds it until the board says it has finished playing back.
 */

let session: GameSession | null = null;
let revealListener: ((animating: boolean) => void) | null = null;

vi.mock('@/hooks/chat/useChannelGames', () => ({
  useGameSession: () => session,
  useNowSeconds: () => 1_760_000_100,
  useTurnClockEnforcer: () => {},
}));

vi.mock('@/lib/nostr-bridge', () => ({
  useGroupMemberInfo: () => [],
  useMyPubkey: () => 'pk-ana',
}));

vi.mock('@/lib/games/transport', () => ({
  publishAttack: vi.fn(), publishCancel: vi.fn(), publishCheckpoint: vi.fn(),
  publishJoin: vi.fn(), publishMove: vi.fn(), publishResign: vi.fn(),
  publishStart: vi.fn(), publishTopOut: vi.fn(),
}));

// The board is exercised on its own in ChainReactionBoard.test.tsx; here it
// only has to hand back the reveal callback the modal is supposed to respect.
vi.mock('./ChainReactionBoard', () => ({
  __esModule: true,
  default: ({ onRevealChange }: { onRevealChange?: (a: boolean) => void }) => {
    revealListener = onRevealChange ?? null;
    return <div data-testid="cr-board" />;
  },
  SEAT_COLORS: [{ hex: '#ff4d5e', dot: '' }, { hex: '#b4f953', dot: '' }],
}));

const GameModal = (await import('./GameModal')).default;

function finishedTable(): GameSession {
  return {
    id: 'table-1', channelId: 'channel-1', game: 'chain-reaction', status: 'finished',
    createdBy: 'pk-ana', createdAt: 1_760_000_000, opts: {}, turnTimeoutS: 45,
    minPlayers: 2, maxPlayers: 8,
    participants: ['pk-ana', 'pk-bruno'],
    seats: [{ id: 'pk-ana', by: 'pk-ana', label: 'Ana' }, { id: 'pk-bruno', by: 'pk-bruno', label: 'Bruno' }],
    joined: ['pk-ana', 'pk-bruno'],
    state: { rows: 7, cols: 5, cells: [], seats: {}, order: ['pk-ana', 'pk-bruno'], placed: [true, true], eliminated: ['pk-bruno'] },
    currentTurn: null, turnIndex: 9, turnStartedAt: null, turnDeadline: null,
    winner: 'pk-ana', draw: false, eliminated: ['pk-bruno'],
    finishedAt: 1_760_000_090, match: null,
  } as unknown as GameSession;
}

describe('GameModal result splash', () => {
  beforeEach(() => {
    revealListener = null;
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('waits for the board to finish its cascade before covering it', () => {
    session = finishedTable();
    render(<GameModal gameId="table-1" onClose={() => {}} />);

    // The board reports a cascade in flight the moment the final board lands.
    act(() => { revealListener?.(true); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByText(/YOU WON|GAME OVER|YOU LOST/)).toBeNull();

    // …and the splash arrives once it settles.
    act(() => { revealListener?.(false); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('YOU WON')).toBeTruthy();
  });

  it('shows the splash on its own when no cascade is reported', () => {
    session = finishedTable();
    render(<GameModal gameId="table-1" onClose={() => {}} />);
    expect(screen.queryByText('YOU WON')).toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('YOU WON')).toBeTruthy();
  });

  it('gives up waiting rather than swallowing the result forever', () => {
    session = finishedTable();
    render(<GameModal gameId="table-1" onClose={() => {}} />);
    act(() => { revealListener?.(true); });
    // A board that never reports "settled" must not eat the splash.
    act(() => { vi.advanceTimersByTime(7000); });
    expect(screen.getByText('YOU WON')).toBeTruthy();
  });
});
