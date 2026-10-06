import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@tests/support/intl';

/**
 * NoteThread is a state machine fed by two async chains per note: the note
 * and its parents (sequential, bounded) and its replies (one query). These
 * tests drive both chains by hand so the order of arrival is the test's
 * choice, which is what the component has to be right about.
 */

const ME = 'f'.repeat(64);
const AUTHOR = 'b'.repeat(64);
const ROOT = 'a'.repeat(64);
const PARENT = 'c'.repeat(64);
const GRAND = 'd'.repeat(64);
const OTHER = 'e'.repeat(64);
const REPLY_1 = '1'.repeat(64);
const REPLY_2 = '2'.repeat(64);
const PUBLISHED = '3'.repeat(64);

type Entry = { id: string; pubkey: string; content: string; createdAt: number; tags: string[][] };

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void };

/**
 * Hoisted so the `vi.mock` factories below (which vitest lifts above every
 * import) can reach it. Each id gets one deferred per request kind, created
 * on first use by either the component or the test, so a test may resolve a
 * request before or after the component issues it.
 */
const sdk = vi.hoisted(() => {
  const deferred = <T,>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
  const notes = new Map<string, Deferred<Entry | null>>();
  const threads = new Map<string, Deferred<Entry[]>>();
  const noteRequests: string[] = [];
  const slot = <T,>(map: Map<string, Deferred<T>>, id: string): Deferred<T> => {
    let d = map.get(id);
    if (!d) { d = deferred<T>(); map.set(id, d); }
    return d;
  };
  return {
    noteRequests,
    note: (id: string) => slot(notes, id),
    thread: (id: string) => slot(threads, id),
    reset() { notes.clear(); threads.clear(); noteRequests.length = 0; },
  };
});

vi.mock('@nostr-wot/data', () => ({
  fetchNote: (id: string) => { sdk.noteRequests.push(id); return sdk.note(id).promise; },
  fetchThread: (id: string) => sdk.thread(id).promise,
}));

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useMyPubkey: () => ME });
});

// NIP-10 marker form only; the real parser's leniency is its own test.
vi.mock('@/services/social/feed', () => ({
  parentIdOf: (note: { tags: string[][] }) =>
    note.tags.find((tag) => tag[0] === 'e' && tag[3] === 'reply')?.[1] ?? null,
}));

vi.mock('@/components/social/NoteCard', () => ({
  default: ({ note }: { note: NostrEvent }) => (
    <article data-testid={`note-${note.id}`}>{note.content}</article>
  ),
}));

vi.mock('@/components/social/NoteComposer', () => ({
  default: ({ onPublished }: { onPublished?: (event: NostrEvent) => void }) => (
    <button
      type="button"
      data-testid="composer-publish"
      onClick={() => onPublished?.({
        id: PUBLISHED, pubkey: ME, content: 'mine', created_at: 9, tags: [], kind: 1, sig: '',
      })}
    >
      publish
    </button>
  ),
}));

import NoteThread from '@/components/social/NoteThread';

const entry = (id: string, content: string, replyTo?: string): Entry => ({
  id,
  pubkey: AUTHOR,
  content,
  createdAt: 1,
  tags: replyTo ? [['e', replyTo, '', 'reply']] : [],
});

const renderThread = (noteId: string) => render(
  <LocaleProvider initialLocale="en"><NoteThread noteId={noteId} /></LocaleProvider>,
);

const settle = () => act(async () => { await Promise.resolve(); });

/** Resolve a request and let the component's continuation run. */
const resolveNote = async (id: string, value: Entry | null) => {
  await act(async () => { sdk.note(id).resolve(value); });
};
const resolveThread = async (id: string, value: Entry[]) => {
  await act(async () => { sdk.thread(id).resolve(value); });
};

/** Ids of the rendered cards, in document order. */
const renderedIds = () =>
  screen.queryAllByTestId(/^note-[0-9a-f]{64}$/).map((el) => el.getAttribute('data-testid')!.slice('note-'.length));

describe('NoteThread', () => {
  beforeEach(() => sdk.reset());

  it('shows a skeleton until the note arrives, then the chain oldest first, then the replies', async () => {
    renderThread(ROOT);
    expect(screen.getByTestId('thread-loading')).toBeTruthy();

    await resolveNote(ROOT, entry(ROOT, 'root', PARENT));
    expect(screen.queryByTestId('thread-loading')).toBeNull();
    expect(screen.getByTestId('thread-focus').textContent).toBe('root');
    // Parents are fetched one at a time, each after the one below it.
    expect(sdk.noteRequests).toEqual([ROOT, PARENT]);
    expect(screen.getByText('No replies yet.')).toBeTruthy();

    await resolveNote(PARENT, entry(PARENT, 'parent', GRAND));
    await resolveNote(GRAND, entry(GRAND, 'grand'));
    await settle();
    expect(renderedIds()).toEqual([GRAND, PARENT, ROOT]);

    await resolveThread(ROOT, [entry(ROOT, 'root'), entry(REPLY_1, 'first reply')]);
    expect(renderedIds()).toEqual([GRAND, PARENT, ROOT, REPLY_1]);
    expect(screen.queryByText('No replies yet.')).toBeNull();
  });

  it('shows the not-found message when the note cannot be fetched', async () => {
    renderThread(ROOT);
    await resolveNote(ROOT, null);
    expect(screen.getByTestId('thread-error').textContent).toBe('That note could not be found on your feed relays.');
    expect(screen.queryByTestId('thread-loading')).toBeNull();
  });

  it('shows the not-found message when the fetch itself fails', async () => {
    renderThread(ROOT);
    await act(async () => { sdk.note(ROOT).reject(new Error('relay down')); });
    expect(screen.getByTestId('thread-error')).toBeTruthy();
  });

  it('treats a failed reply query as no replies, not as a missing note', async () => {
    renderThread(ROOT);
    await resolveNote(ROOT, entry(ROOT, 'root'));
    await act(async () => { sdk.thread(ROOT).reject(new Error('timeout')); });
    expect(screen.getByTestId('thread-focus')).toBeTruthy();
    expect(screen.getByText('No replies yet.')).toBeTruthy();
    expect(screen.queryByTestId('thread-error')).toBeNull();
  });

  it('stops walking parents when the chain loops back on itself', async () => {
    renderThread(ROOT);
    await resolveNote(ROOT, entry(ROOT, 'root', PARENT));
    await resolveNote(PARENT, entry(PARENT, 'parent', ROOT));
    await settle();
    expect(renderedIds()).toEqual([PARENT, ROOT]);
    expect(sdk.noteRequests).toEqual([ROOT, PARENT]);
  });

  /**
   * The one that matters for the thread's state handling: moving to another
   * note must read as a fresh thread at once (skeleton, no leftover replies
   * or parents), and whatever the previous note's chains still deliver must
   * not land in the new thread.
   */
  it('switching notes starts from a blank thread and ignores the old note\'s late answers', async () => {
    const view = renderThread(ROOT);
    await resolveNote(ROOT, entry(ROOT, 'root', PARENT));
    await resolveNote(PARENT, entry(PARENT, 'parent'));
    await settle();
    expect(renderedIds()).toEqual([PARENT, ROOT]);
    // ROOT's replies are still in flight when the user moves on.

    view.rerender(<LocaleProvider initialLocale="en"><NoteThread noteId={OTHER} /></LocaleProvider>);
    expect(screen.getByTestId('thread-loading')).toBeTruthy();
    expect(renderedIds()).toEqual([]);

    await resolveNote(OTHER, entry(OTHER, 'other'));
    await resolveThread(OTHER, [entry(REPLY_2, 'reply to other')]);
    expect(renderedIds()).toEqual([OTHER, REPLY_2]);

    // The old note's replies arrive now. They belong to a thread no longer shown.
    await resolveThread(ROOT, [entry(REPLY_1, 'reply to root')]);
    expect(renderedIds()).toEqual([OTHER, REPLY_2]);
    expect(screen.queryByTestId('thread-loading')).toBeNull();
  });

  it('appends a reply published from the inline composer', async () => {
    renderThread(ROOT);
    await resolveNote(ROOT, entry(ROOT, 'root'));
    await resolveThread(ROOT, [entry(REPLY_1, 'first')]);
    expect(renderedIds()).toEqual([ROOT, REPLY_1]);

    await act(async () => { screen.getByTestId('composer-publish').click(); });
    expect(renderedIds()).toEqual([ROOT, REPLY_1, PUBLISHED]);
  });
});
