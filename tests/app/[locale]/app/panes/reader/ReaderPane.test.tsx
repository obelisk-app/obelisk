import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/components/social/article/ArticleCard', () => ({
  default: ({ note }: { note: { id: string } }) => <div data-testid="article-reader">{note.id}</div>,
}));
vi.mock('@/components/social/note/NoteThread', () => ({
  default: ({ noteId }: { noteId: string }) => <div data-testid="note-thread">{noteId}</div>,
}));

import { FeedPaneActions, ReaderPaneContent, ReaderPaneHeader } from '@/app/[locale]/app/panes/reader/ReaderPane';

const wrap = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('ReaderPaneHeader', () => {
  it('shows the title; back and close both go back; expand toggles full', () => {
    const onBack = vi.fn();
    const onToggleFull = vi.fn();
    wrap(<ReaderPaneHeader title="Thread" full={false} onToggleFull={onToggleFull} onBack={onBack} />);
    expect(screen.getByRole('heading', { name: 'Thread' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('desktop-thread-back'));
    fireEvent.click(screen.getByTestId('desktop-thread-close'));
    expect(onBack).toHaveBeenCalledTimes(2);
    const expand = screen.getByTestId('desktop-thread-expand');
    expect(expand.getAttribute('aria-label')).toBe('Expand feed');
    fireEvent.click(expand);
    expect(onToggleFull).toHaveBeenCalledTimes(1);
  });

  it('offers restore when full', () => {
    wrap(<ReaderPaneHeader title="Thread" full onToggleFull={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId('desktop-thread-expand').getAttribute('aria-label')).toBe('Show beside chat');
  });
});

describe('FeedPaneActions', () => {
  const handlers = () => ({ onExpand: vi.fn(), onRestore: vi.fn(), onClose: vi.fn() });

  it('split: expand and close', () => {
    const h = handlers();
    wrap(<FeedPaneActions mode="split" canRestore {...h} />);
    expect(screen.queryByTestId('feed-pane-restore')).toBeNull();
    fireEvent.click(screen.getByTestId('feed-pane-expand'));
    fireEvent.click(screen.getByTestId('feed-pane-close'));
    expect(h.onExpand).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it('full and restorable: restore and close', () => {
    const h = handlers();
    wrap(<FeedPaneActions mode="full" canRestore {...h} />);
    expect(screen.queryByTestId('feed-pane-expand')).toBeNull();
    fireEvent.click(screen.getByTestId('feed-pane-restore'));
    expect(h.onRestore).toHaveBeenCalledTimes(1);
  });

  it('full with nothing to restore to: close only', () => {
    wrap(<FeedPaneActions mode="full" canRestore={false} {...handlers()} />);
    expect(screen.queryByTestId('feed-pane-expand')).toBeNull();
    expect(screen.queryByTestId('feed-pane-restore')).toBeNull();
    expect(screen.getByTestId('feed-pane-close')).toBeInTheDocument();
  });
});

describe('ReaderPaneContent', () => {
  const noop = () => {};

  it('an article wins over a thread', () => {
    wrap(<ReaderPaneContent article={{ id: 'art' } as never} threadNoteId="n1" onOpenProfile={noop} onOpenNote={noop} />);
    expect(screen.getByTestId('desktop-article-pane')).toBeInTheDocument();
    expect(screen.getByTestId('article-reader').textContent).toBe('art');
    expect(screen.queryByTestId('note-thread')).toBeNull();
  });

  it('shows the thread, or nothing', () => {
    const { unmount } = wrap(<ReaderPaneContent article={null} threadNoteId="n1" onOpenProfile={noop} onOpenNote={noop} />);
    expect(screen.getByTestId('desktop-thread-body')).toBeInTheDocument();
    expect(screen.getByTestId('note-thread').textContent).toBe('n1');
    unmount();
    wrap(<ReaderPaneContent article={null} threadNoteId={null} onOpenProfile={noop} onOpenNote={noop} />);
    expect(screen.getByTestId('desktop-thread-body').childElementCount).toBe(0);
  });
});
