import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SlashCommandAutocomplete, { SLASH_COMMANDS } from './SlashCommandAutocomplete';

describe('/play and /app', () => {
  const play = SLASH_COMMANDS.find((c) => c.name === 'play')!;
  const app = SLASH_COMMANDS.find((c) => c.name === 'app')!;

  it('describes the relay\'s catalog rather than naming built-in games', () => {
    // Games are apps published on the relay; no list of names here can be right.
    expect(play.description).toMatch(/published on this relay/);
    expect(play.description).not.toMatch(/Chain Reaction|Vesta|Stacker/);
  });

  it('offers /app for everything that is not a game', () => {
    expect(app).toBeDefined();
    expect(app.description).toMatch(/published on this relay/);
  });

  it('shows the description in the autocomplete', () => {
    render(<SlashCommandAutocomplete commands={[play]} selectedIndex={0} onSelect={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('slash-option')).toHaveTextContent('Play a game');
  });
});
