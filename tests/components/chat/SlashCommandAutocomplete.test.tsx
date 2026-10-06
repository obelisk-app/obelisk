import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SlashCommandAutocomplete, { SLASH_COMMANDS } from '@/components/chat/SlashCommandAutocomplete';
import { gameCatalog } from '@/lib/games/catalog';
import { LocaleProvider } from '@tests/support/intl';

describe('/play command', () => {
  const play = SLASH_COMMANDS.find((c) => c.name === 'play')!;

  it('names every playable game, not just one of them', () => {
    for (const game of gameCatalog()) {
      expect(play.description).toContain(game.displayName);
    }
    expect(gameCatalog().length).toBeGreaterThan(1);
  });

  it('does not claim the picker only opens Chain Reaction', () => {
    expect(play.description).not.toMatch(/^Open a Chain Reaction/);
  });

  it('shows that description in the autocomplete', () => {
    render(
      <LocaleProvider initialLocale="en">
      <SlashCommandAutocomplete
        sections={[{ key: 'obelisk', commands: [play] }]}
        selectedIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      /></LocaleProvider>,
    );
    expect(screen.getByTestId('slash-option')).toHaveTextContent('Vesta');
    expect(screen.getByTestId('slash-option')).toHaveTextContent('Chain Reaction');
  });
});

describe('bot command rail', () => {
  const bot = { pubkey: 'b'.repeat(64), name: 'ranks' };
  const milugar = { name: 'milugar', description: 'Tu lugar', insert: '!milugar', bot };

  it('lists sections with the bot name and filters from the rail', () => {
    const onFilter = vi.fn();
    const sections = [
      { key: 'obelisk', commands: SLASH_COMMANDS },
      { key: bot.pubkey, bot, commands: [milugar] },
    ];
    render(
      <LocaleProvider initialLocale="en">
      <SlashCommandAutocomplete
        sections={sections}
        rail={sections}
        onFilter={onFilter}
        botProfiles={{ [bot.pubkey]: { name: 'La Crypta Ranks', picture: null } }}
        selectedIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      /></LocaleProvider>,
    );
    const rows = screen.getAllByTestId('slash-option');
    expect(rows[0]).toHaveTextContent('/zap');
    expect(rows[rows.length - 1]).toHaveTextContent('La Crypta Ranks');
    fireEvent.mouseDown(screen.getAllByTestId('slash-rail-item')[1]);
    expect(onFilter).toHaveBeenCalledWith(bot.pubkey);
  });
});
