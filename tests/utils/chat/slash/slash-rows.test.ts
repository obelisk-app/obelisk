import { describe, expect, it, vi } from 'vitest';
import { keepingFocus, slashRailItems, slashSectionRows } from '@/utils/chat/slash/slash-rows';
import { SLASH_COMMANDS } from '@/constants/chat/slash';

const bot = { pubkey: 'b'.repeat(64), name: 'ranks' };
const botCmd = { name: 'x', insert: '!x', bot };
const sections = [{ key: 'obelisk', commands: SLASH_COMMANDS.slice(0, 2) }, { key: bot.pubkey, bot, commands: [botCmd] }];

describe('slashSectionRows', () => {
  it('numbers rows across sections, keys them, and labels bot rows', () => {
    const groups = slashSectionRows(sections, { [bot.pubkey]: { name: 'Ranks', picture: 'https://x/p.png' } });
    const rows = groups.flatMap((g) => g.rows);
    expect(rows.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(rows[0]).toMatchObject({ botLabel: null, picture: null, key: `obelisk::${SLASH_COMMANDS[0].name}` });
    expect(rows[2]).toMatchObject({ botLabel: 'Ranks', picture: 'https://x/p.png', key: `${bot.pubkey}:${bot.pubkey}:x` });
  });
});

describe('slashRailItems', () => {
  it('a press on the active source goes back to all', () => {
    expect(slashRailItems(sections, bot.pubkey).map((i) => [i.active, i.next])).toEqual([[false, 'obelisk'], [true, 'all']]);
  });
});

describe('keepingFocus', () => {
  it('stops the mouse-down from moving focus, then runs', () => {
    const fn = vi.fn();
    const preventDefault = vi.fn();
    keepingFocus(fn)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledOnce();
  });
});
