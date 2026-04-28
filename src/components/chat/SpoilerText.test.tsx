import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import SpoilerText from './SpoilerText';

describe('SpoilerText', () => {
  it('renders with hidden text by default', () => {
    render(<SpoilerText>secret</SpoilerText>);
    const el = screen.getByTestId('spoiler-text');
    expect(el).toHaveClass('text-transparent');
    expect(el).toHaveTextContent('secret');
  });

  it('reveals text on click', async () => {
    const user = userEvent.setup();
    render(<SpoilerText>secret</SpoilerText>);
    const el = screen.getByTestId('spoiler-text');
    await user.click(el);
    expect(el).toHaveClass('text-lc-white');
    expect(el).not.toHaveClass('text-transparent');
  });

  it('reveals text on Enter key', async () => {
    const user = userEvent.setup();
    render(<SpoilerText>secret</SpoilerText>);
    const el = screen.getByTestId('spoiler-text');
    el.focus();
    await user.keyboard('{Enter}');
    expect(el).toHaveClass('text-lc-white');
  });
});
