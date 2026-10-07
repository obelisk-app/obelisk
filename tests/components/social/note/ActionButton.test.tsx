import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import ActionButton from '@/components/social/note/ActionButton';
import NoteIcon from '@/components/social/note/NoteIcon';

const wrap = (ui: React.ReactNode) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

describe('ActionButton', () => {
  it('renders an SVG icon rather than a unicode glyph', () => {
    // The glyphs this replaced (⚡ ♡) have emoji presentation on most
    // platforms, so two of four icons rendered at a different size and
    // baseline from the others. Fonts, not CSS, were deciding.
    wrap(
      <ActionButton
        kind="reply"
        label="Reply"
        icon={<NoteIcon name="reply" />}
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
      <ActionButton kind="like" label="Like" icon={<NoteIcon name="like" />} count={7} testId="act" onClick={() => {}} />,
    );
    expect(screen.getByTestId('act')).toHaveTextContent('7');

    rerender(
      <LocaleProvider initialLocale="en">
        <ActionButton kind="like" label="Like" icon={<NoteIcon name="like" />} count={0} testId="act" onClick={() => {}} />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('act').textContent?.trim()).toBe('');
  });

  it('reports pressed state for assistive tech', () => {
    wrap(
      <ActionButton kind="like" label="Like" icon={<NoteIcon name="like" filled />} count={1} testId="act" active onClick={() => {}} />,
    );
    expect(screen.getByTestId('act')).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not fire while disabled', () => {
    const onClick = vi.fn();
    wrap(
      <ActionButton kind="zap" label="Zap" icon={<NoteIcon name="reply" />} count={0} testId="act" disabled onClick={onClick} />,
    );
    fireEvent.click(screen.getByTestId('act'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
