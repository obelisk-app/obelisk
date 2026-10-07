import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import RepostButton from '@/components/social/note/RepostButton';

const wrap = (ui: React.ReactNode) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

describe('RepostButton', () => {
  it('offers Repost and Quote in a menu, so quote is reachable on touch', () => {
    // Quote used to be hidden behind a right-click, which touch can't do.
    const onRepost = vi.fn();
    const onQuote = vi.fn();
    wrap(<RepostButton count={2} onRepost={onRepost} onQuote={onQuote} />);

    expect(screen.queryByTestId('note-repost-menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('note-repost'));

    fireEvent.click(screen.getByTestId('note-quote'));
    expect(onQuote).toHaveBeenCalled();
    expect(onRepost).not.toHaveBeenCalled();
  });

  it('reposts from the menu', () => {
    const onRepost = vi.fn();
    wrap(<RepostButton count={0} onRepost={onRepost} onQuote={vi.fn()} />);
    fireEvent.click(screen.getByTestId('note-repost'));
    fireEvent.click(screen.getByTestId('note-repost-confirm'));
    expect(onRepost).toHaveBeenCalled();
  });

  it('stays a one-tap button when there is nothing to choose between', () => {
    const onRepost = vi.fn();
    wrap(<RepostButton count={0} onRepost={onRepost} />);
    fireEvent.click(screen.getByTestId('note-repost'));
    expect(onRepost).toHaveBeenCalled();
    expect(screen.queryByTestId('note-repost-menu')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', () => {
    wrap(<RepostButton count={0} onRepost={vi.fn()} onQuote={vi.fn()} />);
    fireEvent.click(screen.getByTestId('note-repost'));
    expect(screen.getByTestId('note-repost-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('note-repost-menu')).not.toBeInTheDocument();
  });
});
