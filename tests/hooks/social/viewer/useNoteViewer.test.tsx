import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@tests/support/intl';

const mocks = vi.hoisted(() => ({ fetchNote: vi.fn(), initSocial: vi.fn(), querySocial: vi.fn() }));
vi.mock('@nostr-wot/data', async (orig) => ({ ...(await orig<object>()), fetchNote: mocks.fetchNote }));
vi.mock('@/services/social/pool', () => ({ initSocial: mocks.initSocial, querySocial: mocks.querySocial }));

import { useNoteViewer } from '@/hooks/social/viewer/useNoteViewer';

const PK = 'a'.repeat(64);
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const event = (over: Partial<NostrEvent>): NostrEvent => ({ id: 'x', pubkey: PK, kind: 1, created_at: 1, content: '', tags: [], sig: '', ...over });

beforeEach(() => vi.clearAllMocks());

describe('useNoteViewer', () => {
  it('starts ready with the server\'s note, and tells an article from a note', () => {
    const note = renderHook(() => useNoteViewer({ target: null, initialNote: event({}) }), { wrapper }).result.current;
    expect(note).toMatchObject({ state: 'ready', isArticle: false });
    const article = renderHook(() => useNoteViewer({ target: null, initialNote: event({ kind: 30023 }) }), { wrapper }).result.current;
    expect(article.isArticle).toBe(true);
  });

  it('turns a relay entry into a kind 1 event', async () => {
    mocks.fetchNote.mockResolvedValue({ id: 'n', pubkey: PK, content: 'hey', createdAt: 7, tags: [['t', 'x']] });
    const { result } = renderHook(() => useNoteViewer({ target: { kind: 'event', id: 'n', relays: [] }, initialNote: null }), { wrapper });
    expect(result.current.state).toBe('loading');
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.note).toEqual({ id: 'n', pubkey: PK, content: 'hey', created_at: 7, tags: [['t', 'x']], kind: 1, sig: '' });
  });

  it('keeps nothing once the page is gone', async () => {
    let resolve!: (v: unknown) => void;
    mocks.fetchNote.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result, unmount } = renderHook(() => useNoteViewer({ target: { kind: 'event', id: 'n', relays: [] }, initialNote: null }), { wrapper });
    unmount();
    resolve({ id: 'n', pubkey: PK, content: '', createdAt: 1, tags: [] });
    await Promise.resolve();
    expect(result.current.state).toBe('loading');
  });
});
