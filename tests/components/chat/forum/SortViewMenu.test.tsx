import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import { DEFAULT_FORUM_PREFS } from '@/services/forum-prefs';
import { SortViewMenu } from '@/components/chat/forum/SortViewMenu';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('SortViewMenu', () => {
  it('opens, changes a pref, and closes on Escape or a press outside', () => {
    const onChange = vi.fn();
    renderLocalized(<div><SortViewMenu prefs={DEFAULT_FORUM_PREFS} onChange={onChange} /><p data-testid="away">x</p></div>);
    fireEvent.click(screen.getByTestId('forum-sortview-trigger'));
    fireEvent.click(screen.getByTestId('forum-view-gallery'));
    expect(onChange).toHaveBeenCalledWith({ viewMode: 'gallery' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('forum-sortview-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('forum-sortview-trigger'));
    fireEvent.mouseDown(screen.getByTestId('away'));
    expect(screen.queryByTestId('forum-sortview-menu')).toBeNull();
  });
});
