import '@tests/support/game-engines';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH, getValidPositions, type GameState } from 'vesta';
import VestaTable from '@/components/games/vesta/VestaTable';
import { deriveSession, type GameSession } from '@/lib/games/session/session';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol/protocol';
import { hexCenter, vertexAt } from '@/lib/games/vesta/geometry';
import type { VestaAction } from '@/lib/games/vesta/definition';
import { LocaleProvider } from '@tests/support/intl';

/**
 * What the Vesta table's controls do: the build toggles, the board click, the
 * robber and the steal, the discard counters and the trade panel. Written
 * against the table before it moved onto the markup-only rule, and kept as is.
 */

const CH = 'channel-1';
const HOST = 'pk-host';
const B = 'pk-b';
const GAME_ID = 'v'.repeat(64);

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

function parsed(id: string, pubkey: string, createdAt: number, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const ev: GameEvent = { id, pubkey, created_at: createdAt, kind: template.kind, tags: template.tags, content: template.content };
  const p = parseGameEvent(ev);
  if (!p) throw new Error('unparseable');
  return p;
}

function table(): GameSession {
  return deriveSession([
    parsed(GAME_ID, HOST, 1000, buildCreate(CH, { game: 'vesta', opts: { seed: 42 }, turnTimeoutS: 0 })),
    parsed('j1', B, 1001, buildGameOp(CH, GAME_ID, 'join')),
    parsed('s1', HOST, 1002, buildGameOp(CH, GAME_ID, 'start', {
      seats: [{ id: HOST, by: HOST, label: 'Ana' }, { id: B, by: B, label: 'Bruno' }],
    })),
  ], 1100)!;
}

const label = (seat: string) => (seat === HOST ? 'Ana' : seat === B ? 'Bruno' : seat);

function renderTable(state: GameState, opts: { mySeats?: string[] } = {}) {
  const session = table();
  const onAction = vi.fn<(action: VestaAction, seat: string) => Promise<void>>().mockResolvedValue(undefined);
  render(
    <LocaleProvider initialLocale="en">
      <VestaTable session={session} state={state} mySeats={opts.mySeats ?? [HOST]} seatLabel={label} onAction={onAction} />
    </LocaleProvider>,
  );
  return { session, onAction };
}

const base = () => table().state as GameState;

function rich(): GameState {
  const s = base();
  return {
    ...s,
    phase: 'play' as const,
    rolled: true,
    dice: [2, 3] as [number, number],
    players: s.players.map((p) => ({ ...p, resources: { ...p.resources, brick: 4, lumber: 1, wool: 1, grain: 1, ore: 1 } })),
  };
}

/** Make the canvas a 1:1 map of the board, so a click lands where the geometry says. */
function clickBoard(x: number, y: number) {
  const board = screen.getByTestId('vesta-board');
  board.getBoundingClientRect = () => ({
    left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, right: CANVAS_WIDTH, bottom: CANVAS_HEIGHT, x: 0, y: 0, toJSON: () => ({}),
  });
  fireEvent.click(board, { clientX: x, clientY: y });
}

describe('VestaTable controls', () => {
  it('toggles a build mode on and off', () => {
    renderTable(rich());
    const settlement = screen.getByText('🛖 Settlement');
    expect(settlement).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(settlement);
    expect(settlement).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('vesta-board').className).toContain('cursor-pointer');
    fireEvent.click(screen.getByText('🛣 Road'));
    expect(settlement).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('🛣 Road')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByText('🛣 Road'));
    expect(screen.getByText('🛣 Road')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('vesta-board').className).not.toContain('cursor-pointer');
  });

  it('places a setup settlement where the board is clicked, and ignores clicks off the legal spots', () => {
    const state = base();
    const { onAction } = renderTable(state);
    const key = getValidPositions(state, 'initial-settlement')[0].key;
    const spot = vertexAt(key)!;
    clickBoard(-500, -500);
    expect(onAction).not.toHaveBeenCalled();
    clickBoard(spot.x, spot.y);
    expect(onAction).toHaveBeenCalledWith({ type: 'place-settlement', ...spot.hexes[0] }, HOST);
  });

  it('does nothing on a board click when nothing is being placed', () => {
    const { onAction } = renderTable(rich(), { mySeats: [B] });
    clickBoard(100, 100);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('asks for the robber and moves it to the clicked tile', () => {
    const s = rich();
    const state = { ...s, __obelisk: { robberPending: true } } as GameState;
    const { onAction } = renderTable(state);
    expect(screen.getByTestId('vesta-robber-prompt')).toBeInTheDocument();
    const target = s.board.tiles.find((t) => t.coord.q !== s.board.robber.q || t.coord.r !== s.board.robber.r)!;
    const c = hexCenter(target.coord);
    clickBoard(c.x, c.y);
    expect(onAction).toHaveBeenCalledWith({ type: 'move-robber', q: target.coord.q, r: target.coord.r }, HOST);
  });

  it('offers a steal from the player next to the robber, and lets the thief skip it', () => {
    const s = rich();
    const { q, r } = s.board.robber;
    const state = {
      ...s,
      __obelisk: { stealPending: true },
      players: s.players.map((p, i) => (i === 1 ? { ...p, settlements: [{ q, r, corner: 0 }] } : p)),
    } as GameState;
    const { onAction } = renderTable(state);
    const steal = screen.getByTestId('vesta-steal');
    expect(steal).toHaveTextContent('Bruno:');
    fireEvent.click(within(steal).getByText('🧱'));
    expect(onAction).toHaveBeenCalledWith({ type: 'steal-resource', victim: 1, resource: 'brick' }, HOST);
    fireEvent.click(within(steal).getByText('Skip'));
    expect(screen.queryByTestId('vesta-steal')).not.toBeInTheDocument();
  });

  it('counts a discard between zero and what the hand holds, then sends it', () => {
    const s = base();
    const state = {
      ...s,
      phase: 'play' as const,
      dice: [3, 4] as [number, number],
      players: s.players.map((p, i) => (i === 1 ? { ...p, resources: { ...p.resources, brick: 5, ore: 5 } } : p)),
    };
    const { onAction } = renderTable(state, { mySeats: [B] });
    const panel = screen.getByTestId('vesta-discard');
    const submit = within(panel).getByText('Discard 0/5');
    expect(submit).toBeDisabled();
    const [brickMinus, oreMinus] = [0, 4].map((i) => within(panel).getAllByText('−')[i]);
    const [brickPlus] = within(panel).getAllByText('+');
    fireEvent.click(brickMinus);
    fireEvent.click(oreMinus);
    expect(within(panel).getByText('Discard 0/5')).toBeDisabled();
    for (let i = 0; i < 7; i++) fireEvent.click(brickPlus);
    // Capped at the five bricks in hand.
    const ready = within(panel).getByText('Discard 5/5');
    expect(ready).toBeEnabled();
    fireEvent.click(ready);
    expect(onAction).toHaveBeenCalledWith({
      type: 'discard-resources', resources: { brick: 5, lumber: 0, wool: 0, grain: 0, ore: 0 },
    }, B);
    expect(within(screen.getByTestId('vesta-discard')).getByText('Discard 0/5')).toBeInTheDocument();
  });

  it('lets a player reject an offer', () => {
    const state = {
      ...base(),
      pendingTrade: { from: 0, to: 1, give: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 }, take: { ore: 1, brick: 0, lumber: 0, wool: 0, grain: 0 } },
    } as GameState;
    const { onAction } = renderTable(state, { mySeats: [B] });
    expect(screen.getByTestId('vesta-trade-offer')).toHaveTextContent('Ana offers nothing for 1🪨');
    fireEvent.click(screen.getByText('Reject'));
    expect(onAction).toHaveBeenCalledWith({ type: 'reject-trade' }, B);
  });

  it('withdraws an offer for its proposer', () => {
    const state = {
      ...base(),
      pendingTrade: { from: 0, to: 1, give: { brick: 1, lumber: 0, wool: 0, grain: 0, ore: 0 }, take: { ore: 1, brick: 0, lumber: 0, wool: 0, grain: 0 } },
    } as GameState;
    const { onAction } = renderTable(state);
    fireEvent.click(screen.getByText('Withdraw'));
    expect(onAction).toHaveBeenCalledWith({ type: 'cancel-proposal' }, HOST);
  });

  it('trades with the bank at the seat rates, then clears the draft', () => {
    const { onAction } = renderTable(rich());
    const trade = screen.getByTestId('vesta-trade');
    const submit = within(trade).getByText('Offer trade');
    expect(submit).toBeDisabled();
    fireEvent.click(within(trade).getByText('Bank'));
    expect(within(trade).getByText('Bank')).toHaveAttribute('aria-pressed', 'true');
    expect(trade).toHaveTextContent('Bank rates: 🧱4:1 🪵4:1 🐑4:1 🌾4:1 🪨4:1');
    const plus = within(trade).getAllByText('+');
    // Give row first (brick is its first counter), then the take row.
    for (let i = 0; i < 6; i++) fireEvent.click(plus[0]);
    fireEvent.click(plus[9]);
    const bank = within(trade).getByText('Trade with bank');
    expect(bank).toBeEnabled();
    fireEvent.click(bank);
    expect(onAction).toHaveBeenCalledWith({
      type: 'trade', partner: 'bank',
      give: { brick: 4, lumber: 0, wool: 0, grain: 0, ore: 0 },
      take: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 1 },
    }, HOST);
    expect(within(trade).getByText('Trade with bank')).toBeDisabled();
  });

  it('offers a trade to another seat, never to itself', () => {
    const { onAction } = renderTable(rich());
    const trade = screen.getByTestId('vesta-trade');
    expect(within(trade).queryByText('Ana')).not.toBeInTheDocument();
    fireEvent.click(within(trade).getByText('Bruno'));
    expect(trade).not.toHaveTextContent('Bank rates');
    const plus = within(trade).getAllByText('+');
    fireEvent.click(plus[0]);
    fireEvent.click(plus[9]);
    fireEvent.click(within(trade).getByText('Offer trade'));
    expect(onAction).toHaveBeenCalledWith({
      type: 'propose-trade', partner: 1,
      give: { brick: 1, lumber: 0, wool: 0, grain: 0, ore: 0 },
      take: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 1 },
    }, HOST);
  });

  it('hides the trade panel before the roll', () => {
    renderTable({ ...rich(), rolled: false });
    expect(screen.queryByTestId('vesta-trade')).not.toBeInTheDocument();
  });

  it('shows the dice on the status line', () => {
    renderTable(rich());
    expect(screen.getByText('🎲 2 + 3 = 5')).toBeInTheDocument();
  });

  it('shows my cards and only a count for everyone else', () => {
    renderTable(rich());
    expect(screen.getByTestId('vesta-player-0')).toHaveTextContent('🧱4 🪵1 🐑1 🌾1 🪨1');
    expect(screen.getByTestId('vesta-player-1')).toHaveTextContent('🎴 8');
  });

  it('lists the development cards in hand and plays an available one', () => {
    const s = rich();
    const state = {
      ...s,
      players: s.players.map((p, i) => (i === 0
        ? { ...p, hand: [{ cardType: 'knight', available: true }, { cardType: 'monopoly', available: false }] }
        : p)),
    } as GameState;
    const { onAction } = renderTable(state);
    const hand = screen.getByTestId('vesta-hand');
    expect(hand).toHaveTextContent('Knight');
    expect(within(hand).getByText(/Monopoly/)).toBeDisabled();
    const knight = within(hand).getByText(/Knight/);
    if (!(knight as HTMLButtonElement).disabled) {
      fireEvent.click(knight);
      expect(onAction).toHaveBeenCalledWith({ type: 'play-dev-card', cardType: 'knight' }, HOST);
    }
  });
});
