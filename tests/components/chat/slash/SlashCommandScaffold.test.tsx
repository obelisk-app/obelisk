import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import SlashCommandScaffold from '@/components/chat/slash/SlashCommandScaffold';
import { SLASH_COMMANDS } from '@/utils/chat/slash/slash-commands';

const zap = SLASH_COMMANDS.find((c) => c.name === 'zap')!;
const play = SLASH_COMMANDS.find((c) => c.name === 'play')!;
const show = (command = zap, content = '/zap ', caret = content.length) => render(
  <LocaleProvider initialLocale="en"><SlashCommandScaffold command={command} content={content} caret={caret} /></LocaleProvider>,
);

describe('SlashCommandScaffold', () => {
  it('shows nothing for a command without parameters, another command, or a bare command name', () => {
    expect(show(play, '/play x').container.innerHTML).toBe('');
    expect(show(zap, '/play x').container.innerHTML).toBe('');
    expect(show(zap, '/zap').container.innerHTML).toBe('');
  });

  it('marks the slot the caret is in, and the optional ones not yet filled', () => {
    show(zap, '/zap ');
    const user = screen.getByTestId('slash-slot-user');
    expect(user).toHaveAttribute('data-active', 'true');
    expect(user).not.toHaveAttribute('data-filled');
    expect(user).toHaveClass('text-lc-green');
    expect(user).toHaveTextContent('user');
    expect(user.textContent).toBe('useropt');
    expect(screen.getByTestId('slash-slot-amount')).toHaveClass('text-lc-muted');
    expect(screen.getByTestId('slash-scaffold')).toHaveTextContent('⚡ /zap');
  });

  it('a filled slot shows its value; the active parameter is described below', () => {
    show(zap, '/zap @ana 21');
    const user = screen.getByTestId('slash-slot-user');
    expect(user).toHaveAttribute('data-filled', 'true');
    expect(user).toHaveTextContent('@ana');
    expect(user).toHaveClass('text-lc-white');
    expect(screen.getByTestId('slash-slot-amount')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('slash-scaffold').textContent).toContain('amount');
  });
});
