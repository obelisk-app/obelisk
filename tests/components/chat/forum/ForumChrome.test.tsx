import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { DEFAULT_FORUM_PREFS } from '@/constants/chat/forum';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useSignerReady: () => true });
});

import { ForumChrome } from '@/components/chat/forum/ForumChrome';

function mount(over: Partial<Parameters<typeof ForumChrome>[0]> = {}) {
  const props = {
    searchQuery: '',
    onSearchChange: vi.fn(),
    exactMatch: false,
    onSubmitSearch: vi.fn(),
    onClickNewThread: vi.fn(),
    prefs: DEFAULT_FORUM_PREFS,
    onPrefsChange: vi.fn(),
    forumTags: [{ id: 't1', name: 'news', emoji: null, color: null }],
    selectedTagIds: [],
    onToggleTag: vi.fn(),
    onClearTags: vi.fn(),
    ...over,
  };
  render(<LocaleProvider initialLocale="en"><ForumChrome {...props} /></LocaleProvider>);
  return props;
}

describe('ForumChrome', () => {
  it('renders the pill search named for screen readers and reports typing', () => {
    const props = mount();
    const input = screen.getByRole('textbox', { name: 'Search or create a publication' });
    expect(input).toBe(screen.getByTestId('forum-search-input'));
    expect(input).toHaveClass('rounded-full', 'pl-10');
    fireEvent.change(input, { target: { value: 'nos' } });
    expect(props.onSearchChange).toHaveBeenCalledWith('nos');
  });

  it('the new-publication button and the tag chips wire through', () => {
    const props = mount();
    fireEvent.click(screen.getByTestId('forum-new-thread-btn'));
    expect(props.onClickNewThread).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('forum-tag-t1'));
    expect(props.onToggleTag).toHaveBeenCalledWith('t1');
  });

  it('Enter submits the search, and the placeholder offers to create only without an exact match', () => {
    const props = mount({ searchQuery: 'new idea' });
    fireEvent.submit(screen.getByTestId('forum-search-row'));
    expect(props.onSubmitSearch).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('forum-search-input')).toHaveAttribute('placeholder', 'Press Enter to create…');
  });

  it('the All chip is pressed while no tag is selected, and clears the selection', () => {
    const props = mount({ selectedTagIds: ['t1'] });
    const all = screen.getByTestId('forum-tag-all');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(all);
    expect(props.onClearTags).toHaveBeenCalledTimes(1);
  });
});
