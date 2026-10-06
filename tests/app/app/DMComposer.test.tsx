import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.hoisted(() => ({ result: { directHit: null, nip05Hit: null, nostrResults: [], loading: false } as Record<string, unknown>, queries: [] as string[] }));
vi.mock('@/hooks/useNostrUserSearch', () => ({
  useNostrUserSearch: (q: string) => { search.queries.push(q); return search.result; },
}));
vi.mock('@/services/social/useAuthor', () => ({
  useAuthor: () => ({ name: null, displayName: null, picture: null, nip05: null, about: null, banner: null, lud16: null }),
}));

import DMComposer from '@/app/app/DMComposer';
import { LocaleProvider } from '@/i18n/context';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
const hit = (c: string, name: string, nip05: string | null = null) => ({ pubkey: c.repeat(64), displayName: name, picture: null, nip05 });

describe('DMComposer', () => {
  beforeEach(() => {
    search.result = { directHit: null, nip05Hit: null, nostrResults: [], loading: false };
    search.queries = [];
  });

  it('has no Cancel / Start buttons and searches as you type', () => {
    renderLocalized(<DMComposer onClose={() => {}} onPicked={() => {}} />);
    expect(screen.queryByRole('button', { name: /start/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^cancel$/i })).toBeNull();
    fireEvent.change(screen.getByTestId('dm-compose-input'), { target: { value: 'alice' } });
    expect(search.queries.at(-1)).toBe('alice');
  });

  it('lists people found by name, merges and dedupes hits, and opens the clicked one', () => {
    search.result = { directHit: null, nip05Hit: hit('a', 'Alice', 'alice@x.com'), nostrResults: [hit('a', 'Alice'), hit('b', 'Bob')], loading: false };
    const onPicked = vi.fn();
    renderLocalized(<DMComposer onClose={() => {}} onPicked={onPicked} />);
    fireEvent.change(screen.getByTestId('dm-compose-input'), { target: { value: 'al' } });
    const rows = screen.getAllByTestId('dm-compose-result');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Alice');
    expect(rows[0]).toHaveTextContent('alice@x.com');
    fireEvent.click(rows[1]);
    expect(onPicked).toHaveBeenCalledWith('b'.repeat(64));
  });

  it('Enter opens the highlighted result, arrows move it, Esc closes', () => {
    search.result = { directHit: null, nip05Hit: null, nostrResults: [hit('a', 'Alice'), hit('b', 'Bob')], loading: false };
    const onPicked = vi.fn();
    const onClose = vi.fn();
    renderLocalized(<DMComposer onClose={onClose} onPicked={onPicked} />);
    const input = screen.getByTestId('dm-compose-input');
    fireEvent.change(input, { target: { value: 'bo' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPicked).toHaveBeenCalledWith('b'.repeat(64));
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('a pasted npub resolves straight to a result', () => {
    search.result = { directHit: { pubkey: 'c'.repeat(64), displayName: null, picture: null, nip05: null }, nip05Hit: null, nostrResults: [], loading: false };
    const onPicked = vi.fn();
    renderLocalized(<DMComposer onClose={() => {}} onPicked={onPicked} />);
    const input = screen.getByTestId('dm-compose-input');
    fireEvent.change(input, { target: { value: 'npub1whatever' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPicked).toHaveBeenCalledWith('c'.repeat(64));
  });

  it('says so when nothing matches, and while it is still looking', () => {
    search.result = { directHit: null, nip05Hit: null, nostrResults: [], loading: true };
    const { rerender } = renderLocalized(<DMComposer onClose={() => {}} onPicked={() => {}} />);
    fireEvent.change(screen.getByTestId('dm-compose-input'), { target: { value: 'zz' } });
    expect(screen.getAllByRole('status').some((el) => el.textContent?.includes('Searching'))).toBe(true);
    search.result = { directHit: null, nip05Hit: null, nostrResults: [], loading: false };
    rerender(<LocaleProvider initialLocale="en"><DMComposer onClose={() => {}} onPicked={() => {}} /></LocaleProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('No matches.');
  });
});
