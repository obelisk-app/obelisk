import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import { DEFAULT_FORUM_PREFS } from '@/services/forum-prefs';
import { ForumSortSheet } from '@/app/app/mobile/sheets/ForumSortSheet';

const prefs = DEFAULT_FORUM_PREFS;

function mount(onChange = vi.fn(), close = vi.fn()) {
  render(
    <LocaleProvider initialLocale="en">
      <ForumSortSheet prefs={prefs} onChange={onChange} close={close} />
    </LocaleProvider>,
  );
  return { onChange, close };
}

describe('ForumSortSheet', () => {
  it('renders the forum-sort sheet with the current choice checked', () => {
    mount();
    const host = screen.getByTestId('mobile-forum-sort-sheet');
    expect(host).toHaveClass('sheet-host');
    expect(host).toHaveAttribute('data-screen', 'forum-sort');
    expect(screen.getByTestId('mobile-forum-sort-recent')).toHaveAttribute('data-checked', 'true');
    expect(screen.getByTestId('mobile-forum-sort-created')).toHaveAttribute('data-checked', 'false');
  });

  it('reports a changed preference and closes on Done or a backdrop tap', () => {
    const { onChange, close } = mount();
    fireEvent.click(screen.getByTestId('mobile-forum-match-all'));
    expect(onChange).toHaveBeenCalledWith({ tagMatch: 'all' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByTestId('mobile-forum-sort-sheet').querySelector('.sheet-backdrop')!);
    expect(close).toHaveBeenCalledTimes(2);
  });
});
