import { describe, expect, it } from 'vitest';
import { botLabel, commandDescription, playableGameNames, sectionTitle } from '@/utils/chat/slash/slash-commands';
import { SLASH_COMMANDS } from '@/constants/chat/slash';
import { translator } from '@tests/support/intl';
import { tokenize } from '@/utils/chat/slash/slash-scaffold';

describe('slash command helpers', () => {
  const bot = { pubkey: 'p', name: 'advertised' };

  it('names a bot by its profile, else by what it advertised', () => {
    expect(botLabel(bot, { p: { name: 'Resolved' } })).toBe('Resolved');
    expect(botLabel(bot, {})).toBe('advertised');
  });

  it('titles sections', () => {
    expect(sectionTitle({ key: 'recent', commands: [] }, 'Recent')).toBe('Recent');
    expect(sectionTitle({ key: 'obelisk', commands: [] }, 'Recent')).toBe('Obelisk');
    expect(sectionTitle({ key: 'p', bot, commands: [] }, 'Recent')).toBe('advertised');
    expect(sectionTitle({ key: 'other', commands: [] }, 'Recent')).toBe('other');
  });

  it('lists the playable games in the /play description', () => {
    const play = SLASH_COMMANDS.find((c) => c.name === 'play')!;
    expect(commandDescription(translator('en'), 'en', play)).toContain(playableGameNames('en'));
    expect(playableGameNames('en')).toMatch(/, .* or /);
    expect(commandDescription(translator('es'), 'es', play)).toContain(playableGameNames('es'));
    expect(playableGameNames('es')).toMatch(/ o /);
  });

  it('shows a bot command as the bot advertised it', () => {
    expect(commandDescription(translator('es'), 'es', { name: 'milugar', description: 'Tu lugar' })).toBe('Tu lugar');
  });

  it('tokenizes arguments with their offsets', () => {
    expect(tokenize('  @ana  21')).toEqual([
      { value: '@ana', start: 2, end: 6 },
      { value: '21', start: 8, end: 10 },
    ]);
  });
});
