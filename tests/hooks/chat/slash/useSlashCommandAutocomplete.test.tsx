import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSlashCommandAutocomplete } from '@/hooks/chat/slash/useSlashCommandAutocomplete';
import { SLASH_COMMANDS } from '@/constants/chat/slash';

const bot = { pubkey: 'b'.repeat(64), name: 'ranks' };
const sections = [
  { key: 'obelisk', commands: SLASH_COMMANDS.slice(0, 2) },
  { key: bot.pubkey, bot, commands: [{ name: 'x', insert: '!x', bot }] },
];
const base = { sections, filter: 'all', selectedIndex: 0, onSelect: vi.fn(), onClose: vi.fn() };

describe('useSlashCommandAutocomplete', () => {
  it('shows the rail only with a filter handler and more than one source', () => {
    expect(renderHook(() => useSlashCommandAutocomplete({ ...base, rail: sections })).result.current.showRail).toBe(false);
    const { result } = renderHook(() => useSlashCommandAutocomplete({ ...base, rail: sections, onFilter: vi.fn() }));
    expect(result.current.showRail).toBe(true);
    expect(result.current.railItems.map((i) => i.next)).toEqual(['obelisk', bot.pubkey]);
    expect(renderHook(() => useSlashCommandAutocomplete({ ...base, rail: [sections[0]], onFilter: vi.fn() })).result.current.railItems).toEqual([]);
  });

  it('numbers rows across sections; select goes to the latest onSelect', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useSlashCommandAutocomplete({ ...base, onSelect }));
    expect(result.current.groups.flatMap((g) => g.rows.map((r) => r.index))).toEqual([0, 1, 2]);
    act(() => result.current.select(SLASH_COMMANDS[0]));
    expect(onSelect).toHaveBeenCalledWith(SLASH_COMMANDS[0]);
  });

  it('setFilter passes the next filter on', () => {
    const onFilter = vi.fn();
    const { result } = renderHook(() => useSlashCommandAutocomplete({ ...base, rail: sections, onFilter }));
    result.current.setFilter('all');
    expect(onFilter).toHaveBeenCalledWith('all');
  });
});
