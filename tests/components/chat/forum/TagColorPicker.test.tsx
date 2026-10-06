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
});
