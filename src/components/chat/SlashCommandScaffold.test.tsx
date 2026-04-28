import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SlashCommandScaffold, { activeParamIndex, scaffoldMentionSlotQuery } from './SlashCommandScaffold';
import type { SlashCommand } from './SlashCommandAutocomplete';

const ZAP: SlashCommand = {
  name: 'zap',
  description: 'Send a zap',
  params: [
    { name: 'user', description: 'User to zap', kind: 'mention' },
    { name: 'amount', description: 'Amount in sats', kind: 'number' },
  ],
};

describe('activeParamIndex', () => {
  it('selects first slot when caret sits right after the command', () => {
    // rest = ' ' (one space after `/zap`), caret at position 1 (after the space)
    expect(activeParamIndex(' ', 1, ZAP.params!)).toBe(0);
  });

  it('selects the amount slot once user token is present', () => {
    const rest = ' @alice ';
    expect(activeParamIndex(rest, rest.length, ZAP.params!)).toBe(1);
  });

  it('clamps to the last slot when extra tokens are typed', () => {
    const rest = ' @alice 21 extra';
    expect(activeParamIndex(rest, rest.length, ZAP.params!)).toBe(1);
  });

  it('highlights the slot whose token contains the caret', () => {
    const rest = ' @alice 21';
    // caret inside "@alice"
    expect(activeParamIndex(rest, 3, ZAP.params!)).toBe(0);
    // caret inside "21"
    expect(activeParamIndex(rest, 9, ZAP.params!)).toBe(1);
  });
});

describe('scaffoldMentionSlotQuery', () => {
  it('returns null before the user commits to the command', () => {
    expect(scaffoldMentionSlotQuery('/zap', 4)).toBeNull();
  });

  it('returns an empty query when the caret sits right after the command space', () => {
    expect(scaffoldMentionSlotQuery('/zap ', 5)).toBe('');
  });

  it('returns the partial token when typing in the user slot', () => {
    expect(scaffoldMentionSlotQuery('/zap al', 7)).toBe('al');
  });

  it('strips a leading @ from the partial', () => {
    expect(scaffoldMentionSlotQuery('/zap @al', 8)).toBe('al');
  });

  it('returns null once a resolved mention token fills the slot', () => {
    // `/zap @Alice ` — caret past the token; slot is now amount, not mention
    expect(scaffoldMentionSlotQuery('/zap @Alice ', 12)).toBeNull();
  });

  it('returns null when the command has no params', () => {
    expect(scaffoldMentionSlotQuery('/balance ', 9)).toBeNull();
  });

  it('returns null when the active slot is not a mention kind', () => {
    // `/invoice ` — first (and only) param is `amount`, a number slot.
    expect(scaffoldMentionSlotQuery('/invoice ', 9)).toBeNull();
  });
});

describe('<SlashCommandScaffold>', () => {
  it('renders a pill for each param with the active one highlighted', () => {
    render(<SlashCommandScaffold command={ZAP} content="/zap " caret={5} />);
    const userSlot = screen.getByTestId('slash-slot-user');
    const amountSlot = screen.getByTestId('slash-slot-amount');
    expect(userSlot).toHaveAttribute('data-active');
    expect(amountSlot).not.toHaveAttribute('data-active');
  });

  it('marks filled slots and shifts focus to the next param', () => {
    render(<SlashCommandScaffold command={ZAP} content="/zap @alice " caret={12} />);
    const userSlot = screen.getByTestId('slash-slot-user');
    const amountSlot = screen.getByTestId('slash-slot-amount');
    expect(userSlot).toHaveAttribute('data-filled');
    expect(amountSlot).toHaveAttribute('data-active');
  });

  it('shows the active param description below the pills', () => {
    render(<SlashCommandScaffold command={ZAP} content="/zap " caret={5} />);
    expect(screen.getByText('User to zap')).toBeInTheDocument();
  });

  it('renders nothing before the user commits to the command', () => {
    const { container } = render(
      <SlashCommandScaffold command={ZAP} content="/zap" caret={4} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
