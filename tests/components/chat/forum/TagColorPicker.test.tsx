import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TagColorPicker } from '@/components/chat/forum/TagColorPicker';
import { LocaleProvider } from '@tests/support/intl';

describe('TagColorPicker', () => {
  it('names the swatches in the reader\'s language', () => {
    const onPick = vi.fn();
    render(
      <LocaleProvider initialLocale="es">
        <TagColorPicker tag={{ id: 'news', name: 'news', emoji: null, color: 'amber' }} onPick={onPick} />
      </LocaleProvider>,
    );
    const trigger = screen.getByTestId('forum-tag-color-news');
    expect(trigger.getAttribute('aria-label')).toBe('Color de la etiqueta: Ámbar');
    fireEvent.click(trigger);
    const slate = screen.getByTestId('forum-tag-color-opt-slate');
    expect(slate.getAttribute('aria-label')).toBe('Pizarra');
    expect(slate.getAttribute('title')).toBe('Pizarra');
    fireEvent.click(slate);
    expect(onPick).toHaveBeenCalledWith('slate');
  });

  it('a pick closes the menu; Auto clears the override back to null', () => {
    const onPick = vi.fn();
    render(
      <LocaleProvider initialLocale="en">
        <TagColorPicker tag={{ id: 'n', name: 'n', emoji: null, color: 'amber' }} onPick={onPick} />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByTestId('forum-tag-color-n'));
    expect(screen.getByTestId('forum-tag-color-opt-amber')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('forum-tag-color-opt-slate'));
    expect(screen.queryByTestId('forum-tag-color-menu-n')).toBeNull();
    fireEvent.click(screen.getByTestId('forum-tag-color-n'));
    fireEvent.click(screen.getByTestId('forum-tag-color-auto-n'));
    expect(onPick).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId('forum-tag-color-menu-n')).toBeNull();
  });
});
