import { describe, expect, it } from 'vitest';
import { seatIndex, toMove, type VestaAction } from '@/lib/games/vesta/moves';
import { diceFromEntropy } from '@/lib/games/vesta/dice';

describe('vesta moves', () => {
  it('the acting seat decides the player, whatever the sender wrote', () => {
    const forged = { type: 'end-turn', player: 3 } as unknown as VestaAction;
    expect(toMove(forged, 1)).toMatchObject({ type: 'end-turn', player: 1 });
  });

  it('a roll takes its dice from the log entropy, not from the sender', () => {
    const roll = { type: 'roll-dice', dice: [6, 6] } as unknown as VestaAction;
    expect(toMove(roll, 0, { entropy: 'abc:3' })).toMatchObject({ dice: diceFromEntropy('abc:3') });
  });

  it('maps a seat to its index, or -1 for a stranger', () => {
    expect(seatIndex(['a', 'b'], 'b')).toBe(1);
    expect(seatIndex(['a', 'b'], 'z')).toBe(-1);
  });
});
