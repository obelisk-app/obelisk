import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import {
  ActionButton,
  LikeIcon,
  RepostButton,
  ReplyIcon,
  formatCount,
} from './NoteActions';

const wrap = (ui: React.ReactNode) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

describe('formatCount', () => {
  it('abbreviates large counts without jitter', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1500)).toBe('1.5k');
    expect(formatCount(25_000)).toBe('25k');
    expect(formatCount(2_400_000)).toBe('2.4M');
  });
});

describe('ActionButton', () => {
  it('renders an SVG icon rather than a unicode glyph', () => {
    // The glyphs this replaced (⚡ ♡) have emoji presentation on most
    // platforms, so two of four icons rendered at a different size and
    // baseline from the others. Fonts, not CSS, were deciding.
    wrap(
      <ActionButton
        kind="reply"
        label="Reply"
        icon={<ReplyIcon />}
        count={3}
        testId="act"
        onClick={() => {}}
      />,
    );
    const button = screen.getByTestId('act');
    expect(button.querySelector('svg')).toBeInTheDocument();
    expect(button.textContent).not.toMatch(/[↩⇄♡♥⚡]/);
  });

  it('shows the count and hides a zero', () => {
    const { rerender } = wrap(
      <ActionButton kind="like" label="Like" icon={<LikeIcon />} count={7} testId="act" onClick={() => {}} />,
    );
    expect(screen.getByTestId('act')).toHaveTextContent('7');

    rerender(
      <LocaleProvider initialLocale="en">
        <ActionButton kind="like" label="Like" icon={<LikeIcon />} count={0} testId="act" onClick={() => {}} />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('act').textContent?.trim()).toBe('');
  });

  it('reports pressed state for assistive tech', () => {
    wrap(
      <ActionButton kind="like" label="Like" icon={<LikeIcon filled />} count={1} testId="act" active onClick={() => {}} />,
    );
    expect(screen.getByTestId('act')).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    wrap(
      <ActionButton kind="zap" label="Zap" icon={<ReplyIcon />} count={0} testId="act" disabled onClick={onClick} />,
    );
    fireEvent.click(screen.getByTestId('act'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

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
