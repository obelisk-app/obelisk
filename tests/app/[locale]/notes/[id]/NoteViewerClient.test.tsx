import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { Event as NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { LocaleProvider } from '@tests/support/intl';

const mocks = vi.hoisted(() => ({
  fetchNote: vi.fn(),
  initSocial: vi.fn(),
  querySocial: vi.fn(),
}));

vi.mock('@nostr-wot/data', async (orig) => ({ ...(await orig<object>()), fetchNote: mocks.fetchNote }));
vi.mock('@/services/social/pool', () => ({ initSocial: mocks.initSocial, querySocial: mocks.querySocial }));
vi.mock('@/components/social/note/NoteCard', () => ({
  default: ({ note }: { note: NostrEvent }) => <div data-testid="note-card">{note.id}:{note.content}</div>,
}));
vi.mock('@/components/social/article/ArticleCard', () => ({
  default: ({ note, onOpenProfile }: { note: NostrEvent; onOpenProfile: (pubkey: string) => void }) => (
    <button type="button" data-testid="article" onClick={() => onOpenProfile(note.pubkey)}>{note.id}</button>
  ),
}));

import NoteViewerClient from '@/app/[locale]/notes/[id]/NoteViewerClient';

const PK = 'a'.repeat(64);
const note = (over: Partial<NostrEvent> = {}): NostrEvent => ({
  id: '1'.repeat(64), pubkey: PK, kind: 1, created_at: 100, content: 'hi', tags: [], sig: 's', ...over,
});

const show = (props: Parameters<typeof NoteViewerClient>[0], locale: 'en' | 'es' = 'en') =>
  render(<LocaleProvider initialLocale={locale}><NoteViewerClient {...props} /></LocaleProvider>);

const assign = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, assign } });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
});

describe('NoteViewerClient', () => {
  it('renders the note the server found, without asking the relays again', () => {
    show({ target: { kind: 'event', id: '1'.repeat(64), relays: [] }, initialNote: note() });
    expect(screen.getByTestId('note-viewer')).toBeInTheDocument();
    expect(screen.getByTestId('note-card')).toHaveTextContent('hi');
    expect(mocks.fetchNote).not.toHaveBeenCalled();
    expect(mocks.initSocial).not.toHaveBeenCalled();
  });

  it('says the note is missing when there was nothing to look for', () => {
    show({ target: null, initialNote: null });
    expect(screen.getByTestId('note-viewer-missing')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/app?s=feed');
  });

  it('fetches an event the server missed from the link\'s relays and the feed relays, showing skeletons meanwhile', async () => {
    let resolve!: (v: unknown) => void;
    mocks.fetchNote.mockReturnValue(new Promise((r) => { resolve = r; }));
    show({ target: { kind: 'event', id: '2'.repeat(64), relays: ['wss://hint.example'] }, initialNote: null });
    expect(screen.getByTestId('note-viewer-loading')).toBeInTheDocument();
    const relays = mocks.initSocial.mock.calls[0][0] as string[];
    expect(relays[0]).toBe('wss://hint.example');
    expect(new Set(relays).size).toBe(relays.length);
    expect(mocks.fetchNote).toHaveBeenCalledWith('2'.repeat(64), relays);
    await act(async () => resolve({ id: '2'.repeat(64), pubkey: PK, content: 'late', createdAt: 5, tags: [] }));
    expect(screen.getByTestId('note-card')).toHaveTextContent('late');
  });

  it('says missing when the relays do not have it either, or the fetch fails', async () => {
    mocks.fetchNote.mockResolvedValue(null);
    show({ target: { kind: 'event', id: '3'.repeat(64), relays: [] }, initialNote: null });
    await waitFor(() => expect(screen.getByTestId('note-viewer-missing')).toBeInTheDocument());

    mocks.fetchNote.mockRejectedValue(new Error('down'));
    show({ target: { kind: 'event', id: '4'.repeat(64), relays: [] }, initialNote: null });
    await waitFor(() => expect(screen.getAllByTestId('note-viewer-missing')).toHaveLength(2));
  });

  it('a profile is not a note', async () => {
    show({ target: { kind: 'profile', pubkey: PK, relays: [] }, initialNote: null });
    await waitFor(() => expect(screen.getByTestId('note-viewer-missing')).toBeInTheDocument());
  });

  it('shows the newest version of an addressable event, as an article', async () => {
    mocks.querySocial.mockResolvedValue([
      note({ id: 'old', kind: 30023, created_at: 1 }),
      note({ id: 'new', kind: 30023, created_at: 9 }),
    ]);
    show({ target: { kind: 'address', identifier: 'post', pubkey: PK, eventKind: 30023, relays: [] }, initialNote: null });
    await waitFor(() => expect(screen.getByTestId('article')).toHaveTextContent('new'));
    const [filters, opts] = mocks.querySocial.mock.calls[0];
    expect(filters).toEqual([{ kinds: [30023], authors: [PK], '#d': ['post'], limit: 1 }]);
    expect(opts.relays.length).toBeGreaterThan(0);
  });

  it('opens an article author\'s public profile with a full page load, in the page language', () => {
    show({ target: null, initialNote: note({ kind: 30023 }) }, 'es');
    screen.getByTestId('article').click();
    expect(assign).toHaveBeenCalledWith(`/es/p/${nip19.npubEncode(PK)}`);
  });

  it('falls back to the raw key when it does not encode', () => {
    show({ target: null, initialNote: note({ kind: 30023, pubkey: 'not-hex' }) });
    screen.getByTestId('article').click();
    expect(assign).toHaveBeenCalledWith('/p/not-hex');
  });
});
