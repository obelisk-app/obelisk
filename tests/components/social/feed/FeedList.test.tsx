import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { createRef } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import type { FeedState } from '@/hooks/social/feed/useFeed';

vi.mock('@/components/social/note/NoteCard', () => ({
  default: ({ note, reposters }: { note: NostrEvent; reposters?: string[] }) => (
    <div data-testid="note-card" data-reposters={reposters?.join(',')}>{note.id}</div>
  ),
}));

import FeedList from '@/components/social/feed/FeedList';

type Entry = { isIntersecting: boolean };
let callbacks: Array<(entries: Entry[]) => void> = [];
let observed = 0;

beforeEach(() => {
  callbacks = [];
  observed = 0;
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: Entry[]) => void) { callbacks.push(callback); }
    observe() { observed += 1; }
    disconnect() {}
    unobserve() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const note = (id: string): NostrEvent => ({ id, pubkey: 'p'.repeat(64), kind: 1, content: id, created_at: 1, sig: '', tags: [] });

const feedState = (patch: Partial<FeedState> = {}): FeedState => ({
  notes: [note('n1'), note('n2')],
  repostersByTarget: new Map(),
  loading: false,
  loadingMore: false,
  error: false,
  exhausted: false,
  pendingCount: 0,
  refresh: vi.fn(),
  loadMore: vi.fn(),
  showPending: vi.fn(),
  ...patch,
});

function renderList(state: FeedState, props: Partial<Parameters<typeof FeedList>[0]> = {}) {
  return render(<LocaleProvider initialLocale="en"><FeedList state={state} {...props} /></LocaleProvider>);
}

/** A scroll container the list can watch, at a given scrollTop. */
function scroller(scrollTop = 0) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true, configurable: true });
  return el;
}

describe('FeedList', () => {
  it('shows skeletons while the first page loads', () => {
    renderList(feedState({ notes: [], loading: true }));
    expect(screen.getByTestId('feed-loading')).toBeInTheDocument();
  });

  it('shows the empty label, or the failure, with a refresh button', () => {
    const state = feedState({ notes: [] });
    const { unmount } = renderList(state, { emptyLabel: 'Nothing here' });
    expect(screen.getByTestId('feed-empty')).toHaveTextContent('Nothing here');
    fireEvent.click(screen.getByTestId('feed-empty').querySelector('button')!);
    expect(state.refresh).toHaveBeenCalled();
    unmount();
    renderList(feedState({ notes: [], error: true }), { emptyLabel: 'Nothing here' });
    expect(screen.getByTestId('feed-empty')).not.toHaveTextContent('Nothing here');
  });

  it('renders a row per note with its reposters', () => {
    renderList(feedState({ repostersByTarget: new Map([['n2', ['a', 'b']]]) }));
    const rows = screen.getAllByTestId('note-card');
    expect(rows.map((r) => r.textContent)).toEqual(['n1', 'n2']);
    expect(rows[1].dataset.reposters).toBe('a,b');
  });

  it('lets the live tail in only through the pill', () => {
    const state = feedState({ pendingCount: 3 });
    renderList(state);
    expect(state.showPending).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('feed-pending'));
    expect(state.showPending).toHaveBeenCalledTimes(1);
  });

  it('pages when the sentinel comes into range, and not once exhausted', () => {
    const state = feedState();
    const { unmount } = renderList(state);
    expect(observed).toBe(1);
    callbacks[0]([{ isIntersecting: false }]);
    expect(state.loadMore).not.toHaveBeenCalled();
    callbacks[0]([{ isIntersecting: true }]);
    expect(state.loadMore).toHaveBeenCalledTimes(1);
    unmount();
    observed = 0;
    renderList(feedState({ exhausted: true }));
    expect(observed).toBe(0);
    expect(screen.getByTestId('feed-sentinel')).not.toHaveTextContent(/load more/i);
  });

  it('shows the spinner while a page is in flight and a manual button otherwise', () => {
    const state = feedState();
    const { unmount } = renderList(state);
    fireEvent.click(screen.getByTestId('feed-load-more'));
    expect(state.loadMore).toHaveBeenCalled();
    unmount();
    renderList(feedState({ loadingMore: true }));
    expect(screen.getByTestId('feed-loading-more')).toBeInTheDocument();
  });

  it('reports whether the scroller is at the top', () => {
    const el = scroller(0);
    const ref = createRef<HTMLElement>() as { current: HTMLElement | null };
    ref.current = el;
    const onAtTopChange = vi.fn();
    renderList(feedState(), { scrollRef: ref, onAtTopChange });
    expect(onAtTopChange).toHaveBeenLastCalledWith(true);
    el.scrollTop = 500;
    fireEvent.scroll(el);
    expect(onAtTopChange).toHaveBeenLastCalledWith(false);
    el.scrollTop = 100;
    fireEvent.scroll(el);
    expect(onAtTopChange).toHaveBeenLastCalledWith(true);
  });

  it('finds the nearest scrolling ancestor when no ref is given', () => {
    const outer = document.createElement('div');
    outer.style.overflowY = 'auto';
    Object.defineProperty(outer, 'scrollTop', { value: 0, writable: true, configurable: true });
    document.body.appendChild(outer);
    const onAtTopChange = vi.fn();
    render(<LocaleProvider initialLocale="en"><FeedList state={feedState()} onAtTopChange={onAtTopChange} /></LocaleProvider>, { container: outer });
    outer.scrollTop = 900;
    fireEvent.scroll(outer);
    expect(onAtTopChange).toHaveBeenLastCalledWith(false);
    outer.remove();
  });

  it('refreshes on a deliberate pull at the very top, throttled', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const el = scroller(0);
    const ref = { current: el as HTMLElement | null };
    const state = feedState();
    renderList(state, { scrollRef: ref });
    // A short pull is the tail of a scroll, not a gesture.
    fireEvent.wheel(el, { deltaY: -30 });
    expect(state.refresh).not.toHaveBeenCalled();
    fireEvent.wheel(el, { deltaY: -40 });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    // Inside the cooldown: no second round trip.
    fireEvent.wheel(el, { deltaY: -100 });
    expect(state.refresh).toHaveBeenCalledTimes(1);
    act(() => { vi.setSystemTime(105_000); });
    fireEvent.wheel(el, { deltaY: -100 });
    expect(state.refresh).toHaveBeenCalledTimes(2);
  });

  it('does not refresh when not at the top, or on a downward scroll', () => {
    const el = scroller(300);
    const state = feedState();
    renderList(state, { scrollRef: { current: el } });
    fireEvent.wheel(el, { deltaY: -200 });
    el.scrollTop = 0;
    fireEvent.wheel(el, { deltaY: 200 });
    expect(state.refresh).not.toHaveBeenCalled();
  });

  it('refreshes on a touch pull that started at the top', () => {
    const el = scroller(0);
    const state = feedState();
    renderList(state, { scrollRef: { current: el } });
    fireEvent.touchStart(el, { touches: [{ clientY: 100 }] });
    // Rubber-banding moves scrollTop mid-gesture; only the start counts.
    el.scrollTop = -20;
    fireEvent.touchMove(el, { touches: [{ clientY: 190 }] });
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores a touch pull that started below the top', () => {
    const el = scroller(50);
    const state = feedState();
    renderList(state, { scrollRef: { current: el } });
    fireEvent.touchStart(el, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(el, { touches: [{ clientY: 300 }] });
    expect(state.refresh).not.toHaveBeenCalled();
  });
});
