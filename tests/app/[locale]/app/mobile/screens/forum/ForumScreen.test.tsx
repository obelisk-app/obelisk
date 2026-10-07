import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { ForumScreen } from '@/app/[locale]/app/mobile/screens/forum/ForumScreen';
import { group, message } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const TAGS = [
  { id: 'news', name: 'News', emoji: '📰', color: null },
  { id: 'help', name: 'Help', emoji: null, color: null },
];
const OP = 'b'.repeat(64);
const LAST = 'c'.repeat(64);

function seed() {
  return fakeBridge({
    groups: [
      group({ id: 'f1', name: 'Board', kind: 'forum', forumTags: TAGS }),
      group({ id: 't1', name: 'Release notes', parent: 'f1', topics: ['news'] }),
      group({ id: 't2', name: 'Stuck on login', parent: 'f1', topics: ['help', 'gone'] }),
      group({ id: 't3', name: 'Empty one', parent: 'f1' }),
    ],
    childrenByParent: { f1: ['t1', 't2', 't3'] },
    messagesByGroup: {
      t1: [message({ id: 'm1', pubkey: OP, content: 'Version 2 is out', createdAt: 10 }), message({ id: 'm2', pubkey: LAST, createdAt: 30 })],
      t2: [message({ id: 'm3', pubkey: OP, content: 'Cannot sign in', createdAt: 20 })],
    },
    messagesStatusByGroup: { t3: 'empty-confirmed' },
    userMetadata: { [OP]: { name: 'Olga' } as never, [LAST]: { name: 'Lars' } as never },
  });
}

const mount = (selectChild = vi.fn(), back = vi.fn()) => {
  renderWithBridge(<ForumScreen groupId="f1" back={back} selectChild={selectChild} />, seed());
  return { selectChild, back };
};

describe('ForumScreen', () => {
  it('lists the threads with messages, newest activity first, and hides the empty one', () => {
    mount();
    const cards = screen.getAllByTestId('mobile-forum-card');
    expect(cards.map((c) => c.getAttribute('data-thread-id'))).toEqual(['t1', 't2']);
    expect(screen.queryByText('Empty one')).toBeNull();
  });

  it('shows the opening post, the poster names, the message count and the known tags', () => {
    mount();
    const card = screen.getAllByTestId('mobile-forum-card')[0];
    expect(card).toHaveTextContent('Version 2 is out');
    expect(card).toHaveTextContent('Olga');
    expect(card).toHaveTextContent('Lars');
    expect(screen.getByTestId('mobile-thread-tag-news')).toHaveTextContent('📰');
    expect(screen.queryByTestId('mobile-thread-tag-gone')).toBeNull();
  });

  it('shows a loading card for a thread whose messages have not arrived yet', () => {
    const bridge = seed();
    bridge.stores.messagesStatusByGroup.set({});
    renderWithBridge(<ForumScreen groupId="f1" back={vi.fn()} selectChild={vi.fn()} />, bridge);
    const skeleton = screen.getByTestId('mobile-forum-card-skeleton');
    expect(skeleton).toHaveAttribute('data-thread-id', 't3');
    expect(skeleton).toHaveTextContent('Empty one');
  });

  it('opens a thread on tap', () => {
    const { selectChild } = mount();
    fireEvent.click(screen.getAllByTestId('mobile-forum-card')[1]);
    expect(selectChild).toHaveBeenCalledWith('t2');
  });

  it('filters by a tag chip and clears with All', () => {
    mount();
    fireEvent.click(screen.getByTestId('mobile-forum-tag-help'));
    expect(screen.getByTestId('mobile-forum-tag-help')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('mobile-forum-card').map((c) => c.getAttribute('data-thread-id'))).toEqual(['t2']);
    fireEvent.click(screen.getByTestId('mobile-forum-tag-all'));
    expect(screen.getAllByTestId('mobile-forum-card')).toHaveLength(2);
  });

  it('opens the new-thread sheet with the search text on submit when nothing matches, and not when one does', () => {
    mount();
    const input = screen.getByTestId('mobile-forum-search-input');
    fireEvent.change(input, { target: { value: 'release notes' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.queryByTestId('mobile-new-thread-sheet')).toBeNull();
    fireEvent.change(input, { target: { value: '  brand new  ' } });
    expect(screen.getByTestId('mobile-forum-no-matches')).toHaveTextContent('brand new');
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByTestId('mobile-new-thread-title')).toHaveValue('brand new');
  });

  it('carries the search text into the composer from the + pill and clears the search', () => {
    mount();
    fireEvent.change(screen.getByTestId('mobile-forum-search-input'), { target: { value: 'idea' } });
    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(screen.getByTestId('mobile-forum-search-input')).toHaveValue('');
    fireEvent.change(screen.getByTestId('mobile-forum-search-input'), { target: { value: 'idea ' } });
    fireEvent.click(screen.getByTestId('mobile-forum-new-thread-btn'));
    expect(screen.getByTestId('mobile-new-thread-title')).toHaveValue('idea');
  });

  it('opens the sort sheet from the sort chip', () => {
    mount();
    fireEvent.click(screen.getByTestId('mobile-forum-sort-trigger'));
    expect(screen.getByTestId('mobile-forum-sort-sheet')).toBeInTheDocument();
  });

  it('goes back from the header', () => {
    const { back } = mount();
    fireEvent.click(document.querySelector('.chat-breadcrumb button')!);
    expect(back).toHaveBeenCalledTimes(1);
  });
});
