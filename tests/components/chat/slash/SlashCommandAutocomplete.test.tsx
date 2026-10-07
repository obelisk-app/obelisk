import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SlashCommandAutocomplete from '@/components/chat/slash/SlashCommandAutocomplete';
import { SLASH_COMMANDS } from '@/utils/chat/slash/slash-commands';
import { gameCatalog } from '@/lib/games/core/catalog';
import { LocaleProvider, translator } from '@tests/support/intl';
import { commandDescription } from '@/utils/chat/slash/slash-commands';

describe('/play command', () => {
  const play = SLASH_COMMANDS.find((c) => c.name === 'play')!;
  const description = commandDescription(translator('en'), 'en', play);

  it('names every playable game, not just one of them', () => {
    for (const game of gameCatalog()) {
      expect(description).toContain(game.displayName);
    }
    expect(gameCatalog().length).toBeGreaterThan(1);
  });

  it('does not claim the picker only opens Chain Reaction', () => {
    expect(description).not.toMatch(/^Open a Chain Reaction/);
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

describe('slash autocomplete states', () => {
  const bot = { pubkey: 'b'.repeat(64), name: 'ranks' };
  const milugar = { name: 'milugar', description: 'Tu lugar', insert: '!milugar', bot };
  const sections = [
    { key: 'obelisk', commands: SLASH_COMMANDS.slice(0, 2) },
    { key: bot.pubkey, bot, commands: [milugar] },
  ];
  const mount = (props: Partial<React.ComponentProps<typeof SlashCommandAutocomplete>> = {}) => render(
    <LocaleProvider initialLocale="en">
      <SlashCommandAutocomplete sections={sections} selectedIndex={1} onSelect={vi.fn()} onClose={vi.fn()} {...props} />
    </LocaleProvider>,
  );

  it('numbers rows across sections, marks the selected one, and picks on mouse down', () => {
    const onSelect = vi.fn();
    mount({ onSelect, botProfiles: { [bot.pubkey]: { name: 'Ranks', picture: 'https://x/bot.png' } } });
    const rows = screen.getAllByTestId('slash-option');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Obelisk');
    expect(rows[2]).toHaveTextContent('Ranks');
    expect(rows[2].querySelector('img')).toHaveAttribute('src', 'https://x/bot.png');
    fireEvent.mouseDown(rows[2]);
    expect(onSelect).toHaveBeenCalledWith(milugar);
  });

  it('a bot with no picture gets the robot; the rail is hidden for one source', () => {
    mount({ rail: [sections[0]], onFilter: vi.fn() });
    expect(screen.queryByTestId('slash-rail')).toBeNull();
    expect(screen.getAllByTestId('slash-option')[2].textContent).toContain('🤖');
  });

  it('pressing the active rail item clears the filter back to all', () => {
    const onFilter = vi.fn();
    mount({ rail: sections, onFilter, filter: bot.pubkey });
    const items = screen.getAllByTestId('slash-rail-item');
    expect(items[1]).toHaveAttribute('aria-pressed', 'true');
    expect(items[0]).toHaveAttribute('aria-pressed', 'false');
    fireEvent.mouseDown(items[1]);
    expect(onFilter).toHaveBeenCalledWith('all');
  });

  it('says so when nothing matches, and renders nothing without sections or rail', () => {
    mount({ sections: [], rail: sections, onFilter: vi.fn() });
    expect(screen.getByTestId('slash-autocomplete')).toHaveTextContent('No');
    const empty = render(<LocaleProvider initialLocale="en"><SlashCommandAutocomplete sections={[]} selectedIndex={0} onSelect={vi.fn()} onClose={vi.fn()} /></LocaleProvider>);
    expect(empty.container.innerHTML).toBe('');
  });
});
