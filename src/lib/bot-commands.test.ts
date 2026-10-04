import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { SLASH_COMMANDS } from '@/components/chat/SlashCommandAutocomplete';
import { BOT_ALIVE_SECS, filterSlashCommands, mergeSlashCommands, parseBotCommands, slashNameFor } from './bot-commands';

const NOW = 1_800_000_000;

function ev(content: unknown, created_at = NOW, pubkey = 'a'.repeat(64)): NostrEvent {
  return { id: 'x', sig: 'y', kind: 30078, pubkey, created_at, tags: [], content: JSON.stringify(content) };
}

const ranks = parseBotCommands(ev({
  v: 1,
  name: 'obelisk-lacrypta-ranks',
  commands: [
    { command: '!milugar', description: 'Tu posición', example: '!milugar' },
    { command: '!ranking-niveles', description: null, example: '!ranking-niveles' },
    { command: 'not a command' },
  ],
}))!;

describe('bot slash commands', () => {
  it('parses the manager payload and drops malformed entries', () => {
    expect(ranks.name).toBe('obelisk-lacrypta-ranks');
    expect(ranks.commands.map((c) => c.trigger)).toEqual(['!milugar', '!ranking-niveles']);
    expect(parseBotCommands({ ...ev({}), content: 'nope' })).toBeNull();
    expect(parseBotCommands(ev({ name: 'x' }))).toBeNull();
  });

  it('reads cmd tags when the content carries no list', () => {
    const tagged: NostrEvent = {
      ...ev({}),
      content: '',
      tags: [
        ['d', 'obelisk:bot-commands:wss://public.obelisk.ar'],
        ['t', 'obelisk-bot-commands'],
        ['cmd', '!btc', 'Precio de BTC', ''],
      ],
    };
    const set = parseBotCommands(tagged)!;
    expect(set.commands).toEqual([{ trigger: '!btc', description: 'Precio de BTC', example: null }]);
    expect(set.name).toBe('a'.repeat(8));
  });

  it('keeps /zap and /play ahead of every bot command', () => {
    const zapBot = parseBotCommands(ev({ name: 'aaa-zap', commands: [{ command: '!zap' }] }, NOW, 'b'.repeat(64)))!;
    const merged = mergeSlashCommands(SLASH_COMMANDS, [ranks, zapBot], NOW);
    expect(merged.slice(0, SLASH_COMMANDS.length)).toEqual(SLASH_COMMANDS);
    const zaps = filterSlashCommands(merged, 'za');
    expect(zaps[0].bot).toBeUndefined();
    expect(zaps[1].insert).toBe('!zap');
    expect(filterSlashCommands(merged, 'p')[0].name).toBe('play');
  });

  it('inserts the bot trigger and supports hyphenated names', () => {
    const merged = mergeSlashCommands([], [ranks], NOW);
    const [hit] = filterSlashCommands(merged, 'ranking-n');
    expect(hit.name).toBe('ranking-niveles');
    expect(hit.insert).toBe('!ranking-niveles');
    expect(hit.description).toBe('!ranking-niveles');
    expect(slashNameFor('!Milugar')).toBe('milugar');
  });

  it('hides bots whose heartbeat is stale or that advertise nothing', () => {
    const stale = { ...ranks, createdAt: NOW - BOT_ALIVE_SECS - 1 };
    const empty = { ...ranks, commands: [] };
    expect(mergeSlashCommands([], [stale], NOW)).toEqual([]);
    expect(mergeSlashCommands([], [empty], NOW)).toEqual([]);
  });
});
