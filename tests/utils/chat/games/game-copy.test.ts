import { describe, expect, it } from 'vitest';
import { gameInfo } from '@/lib/games/catalog';
import { gameDescription, gameSummary, scoreDetail, scoreLabel } from '@/utils/chat/games/game-copy';
import { translator } from '@tests/support/intl';

const en = translator('en');
const es = translator('es');

describe('game copy', () => {
  it('words each known game, and nothing for one this client does not know', () => {
    expect(gameDescription(en, 'vesta')).toMatch(/trade/);
    expect(gameDescription(es, 'chain-reaction')).toMatch(/tablero/);
    expect(gameDescription(en, 'from-the-future')).toBeNull();
  });

  it('summarises players and clock in the reader’s language', () => {
    expect(gameSummary(en, gameInfo('chain-reaction')!)).toBe('2–8 players · 45s turns');
    expect(gameSummary(en, gameInfo('vesta')!)).toBe('2–4 players · no turn clock');
    expect(gameSummary(es, gameInfo('stacker')!)).toBe('1–6 jugadores · en tiempo real, un dispositivo cada uno');
  });

  it('formats each kind of score', () => {
    expect(scoreLabel(en, { kind: 'vp', vp: 10 })).toBe('10 VP');
    expect(scoreLabel(en, { kind: 'orbs', orbs: 1 })).toBe('1 orb');
    expect(scoreLabel(es, { kind: 'orbs', orbs: 3 })).toBe('3 orbes');
    expect(scoreLabel(en, { kind: 'stacker', attacks: 9, lines: 31 })).toBe('9⚔ · 31▤');
    expect(scoreLabel(es, { kind: 'out' })).toBe('afuera');
    expect(scoreLabel(en, { kind: 'none' })).toBe('-');
    expect(scoreDetail(en, 'vp')).toBe('Victory points at the end of the game');
  });
});
