import '@tests/support/game-engines';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import StackerTable, { type StackerTableProps } from '@/components/games/stacker/StackerTable';
import { deriveSession, type GameSession } from '@/lib/games/session/session';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol/protocol';
import { applyMatchEvent } from '@/lib/games/stacker/match';
import { clearRuns } from '@/lib/games/stacker/run-registry';

/**
 * The table's controls line, the opponents strip and the end states. Written
 * against the table before it moved onto the markup-only rule.
 */

const CH = 'channel-1';
const A = 'pk-ana';
const B = 'pk-bruno';
const GAME_ID = 's'.repeat(64);

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

afterEach(() => {
  clearRuns();
  localStorage.clear();
});

function parsed(id: string, pubkey: string, createdAt: number, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const ev: GameEvent = { id, pubkey, created_at: createdAt, kind: template.kind, tags: template.tags, content: template.content };
  const p = parseGameEvent(ev);
  if (!p) throw new Error('unparseable');
  return p;
}

function match(): GameSession {
  return deriveSession([
    parsed(GAME_ID, A, 1000, buildCreate(CH, { game: 'stacker', opts: { seed: 1234 }, turnTimeoutS: 0 })),
    parsed('j1', B, 1001, buildGameOp(CH, GAME_ID, 'join')),
    parsed('s1', A, 1002, buildGameOp(CH, GAME_ID, 'start', {
      seats: [{ id: A, by: A, label: 'Ana' }, { id: B, by: B, label: 'Bruno' }],
    })),
  ], 1100)!;
}

const label = (s: string) => (s === A ? 'Ana' : s === B ? 'Bruno' : s);

function renderTable(session: GameSession, overrides: Partial<StackerTableProps> = {}) {
  const props: StackerTableProps = {
    session,
    match: overrides.match ?? session.match!,
    mySeats: overrides.mySeats ?? [A],
    seatLabel: label,
    onAttack: vi.fn(),
    onCheckpoint: vi.fn(),
    onTopOut: vi.fn(),
  };
  return render(<LocaleProvider initialLocale="en"><StackerTable {...props} /></LocaleProvider>);
}

describe('StackerTable controls', () => {
  it('opens the key panel and closes it again', () => {
    renderTable(match());
    expect(screen.queryByTestId('stacker-keys-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('stacker-keys-open'));
    expect(screen.getByTestId('stacker-keys-panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('stacker-keys-panel')).not.toBeInTheDocument();
  });

  it('shows the music credit only while the sound is on', () => {
    renderTable(match());
    const mute = screen.getByTestId('stacker-mute');
    const soundOn = mute.textContent === '🔊 sound';
    expect(!!screen.queryByTestId('stacker-music-credit')).toBe(soundOn);
    fireEvent.click(mute);
    expect(screen.getByTestId('stacker-mute')).toHaveTextContent(soundOn ? '🔇 muted' : '🔊 sound');
    expect(!!screen.queryByTestId('stacker-music-credit')).toBe(!soundOn);
  });

  it('shows the basic stats and the empty garbage meter', () => {
    renderTable(match());
    expect(screen.getByTestId('stacker-sent')).toHaveTextContent('0');
    expect(screen.getByTestId('stacker-level')).toHaveTextContent('0');
    expect(screen.getByTestId('stacker-garbage-meter').firstElementChild).toHaveStyle({ height: '0%' });
  });

  it('caps the garbage meter at full', () => {
    const session = match();
    const buried = applyMatchEvent(session.match!, {
      op: 'attack', seat: B, target: A, lines: 20, hole: 2, nonce: 1, at: 1010,
    });
    renderTable(session, { match: buried });
    expect(screen.getByTestId('stacker-garbage-meter').firstElementChild).toHaveStyle({ height: '100%' });
  });

  it('shows a spectator every seat as an opponent and the topped-out veil', () => {
    renderTable(match(), { mySeats: [] });
    expect(screen.getByTestId(`stacker-opponent-${A}`)).toHaveTextContent('Ana');
    expect(screen.getByTestId(`stacker-opponent-${B}`)).toHaveTextContent('Bruno');
    expect(screen.getByTestId('stacker-dead')).toBeInTheDocument();
  });

  it('shows each opponent\'s sent and cleared counts', () => {
    renderTable(match());
    expect(screen.getByTestId(`stacker-opponent-${B}`)).toHaveTextContent('0⚔ · 0▤');
  });

  it('names the mismatch on an unverified opponent', () => {
    const session = match();
    const flagged = applyMatchEvent(session.match!, {
      op: 'checkpoint', seat: B, frame: 600, at: 1010,
      attacksSent: 999, linesCleared: 999, stackHeight: 5,
      inputs: '1h,1h,1h',
    });
    renderTable(session, { match: flagged });
    const suspect = screen.getByTestId(`stacker-suspect-${B}`);
    expect(suspect).toHaveTextContent('⚠ unverified');
    expect(suspect.getAttribute('title')).toMatch(/^Claims 999 /);
  });

  it('says so when everybody topped out', () => {
    const session = match();
    const one = applyMatchEvent(session.match!, { op: 'topout', seat: A, at: 1010 });
    const both = applyMatchEvent(one, { op: 'topout', seat: B, at: 1011 });
    renderTable(session, { match: both });
    expect(screen.getByTestId('stacker-result')).toHaveTextContent('Everybody topped out');
  });
});
