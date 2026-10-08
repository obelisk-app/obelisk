vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock({
    useMyPubkey: () => 'pk-ana',
  });
});
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { GameSession } from '@/lib/games/session/session';
import { LocaleProvider } from '@tests/support/intl';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


/**
 * The result splash and the winning cascade.
 *
 * The deciding move is the biggest chain in the game, and it arrives in the
 * same event that ends the match, so a splash rendered the instant the log
 * says "finished" covers the one explosion anybody wanted to watch. The modal
 * holds it until the board says it has finished playing back.
 */

let session: GameSession | null = null;
let revealListener: ((animating: boolean) => void) | null = null;

vi.mock('@/hooks/games/channel/useChannelGames', () => ({
  useGameSession: () => session,
  useNowSeconds: () => 1_760_000_100,
  useTurnClockEnforcer: () => {},
}));

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    useGroupMemberInfo: () => [],

  });
});

vi.mock('@/services/games/transport', () => ({
  publishAttack: vi.fn(), publishCancel: vi.fn(), publishCheckpoint: vi.fn(),
  publishJoin: vi.fn(), publishMove: vi.fn(), publishResign: vi.fn(),
  publishStart: vi.fn(), publishTopOut: vi.fn(),
}));

// The board is exercised on its own in ChainReactionBoard.test.tsx; here it
// only has to hand back the reveal callback the modal is supposed to respect.
vi.mock('@/components/games/chain-reaction/ChainReactionBoard', () => ({
  __esModule: true,
  default: ({ onRevealChange }: { onRevealChange?: (a: boolean) => void }) => {
    revealListener = onRevealChange ?? null;
    return <div data-testid="cr-board" />;
  },
}));

const GameModal = (await import('@/components/games/table/GameTableModal')).default;
const { GameModalHost } = await import('@/components/games/table/GameModal');
const { useGamesStore } = await import('@/store/games');

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
    renderLocalized(<GameModal gameId="table-1" onClose={() => {}} />);

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
    renderLocalized(<GameModal gameId="table-1" onClose={() => {}} />);
    expect(screen.queryByText('YOU WON')).toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('YOU WON')).toBeTruthy();
  });

  it('gives up waiting rather than swallowing the result forever', () => {
    session = finishedTable();
    renderLocalized(<GameModal gameId="table-1" onClose={() => {}} />);
    act(() => { revealListener?.(true); });
    // A board that never reports "settled" must not eat the splash.
    act(() => { vi.advanceTimersByTime(7000); });
    expect(screen.getByText('YOU WON')).toBeTruthy();
  });
});

describe('GameModal chrome', () => {
  it('uses the shared modal header: title, status line, fullscreen and close', () => {
    session = finishedTable();
    const onClose = vi.fn();
    renderLocalized(<GameModal gameId="table-1" onClose={onClose} />);
    expect(screen.getByRole('heading', { level: 2 })).toBe(screen.getByTestId('game-modal-title'));
    expect(screen.getByTestId('game-fullscreen')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('wears the same header while the table loads, so it can be closed before it arrives', () => {
    session = null;
    const onClose = vi.fn();
    renderLocalized(<GameModal gameId="table-1" onClose={onClose} />);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Loading the table from the relay');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('GameModalHost', () => {
  afterEach(() => { act(() => useGamesStore.getState().setOpenGame(null)); });

  it('mounts nothing while no table is open', () => {
    renderLocalized(<GameModalHost />);
    expect(screen.queryByTestId('game-modal')).toBeNull();
  });

  it('mounts the open table and closes it through the store', () => {
    session = finishedTable();
    act(() => useGamesStore.getState().setOpenGame('table-1'));
    renderLocalized(<GameModalHost />);
    expect(screen.getByTestId('game-modal-title')).toHaveTextContent('Chain Reaction');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useGamesStore.getState().openGameId).toBeNull();
    expect(screen.queryByTestId('game-modal')).toBeNull();
  });
});

describe('GameModal fullscreen', () => {
  it('switches the header button between entering and leaving fullscreen', () => {
    session = finishedTable();
    renderLocalized(<GameModal gameId="table-1" onClose={() => {}} />);
    const button = screen.getByTestId('game-fullscreen');
    const before = button.getAttribute('aria-label');
    fireEvent.click(button);
    expect(screen.getByTestId('game-fullscreen').getAttribute('aria-label')).not.toBe(before);
  });
});
