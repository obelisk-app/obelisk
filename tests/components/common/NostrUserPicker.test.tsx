import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { hexToNpub } from '@nostr-wot/data';
import { LocaleProvider } from '@tests/support/intl';

const search = vi.hoisted(() => ({
  result: { directHit: null, nip05Hit: null, nostrResults: [] as { pubkey: string; displayName: string; picture: null; nip05: null }[], loading: false },
}));
vi.mock('@/hooks/identity/useNostrUserSearch', () => ({ useNostrUserSearch: () => search.result }));
vi.mock('@/hooks/social/profile/useAuthor', () => ({ useAuthor: () => ({ displayName: null, name: null, picture: null }) }));
import NostrUserPicker from '@/components/common/NostrUserPicker';

const alice = { pubkey: 'a'.repeat(64), displayName: 'Alice', picture: null, nip05: null };
const bob = { pubkey: 'b'.repeat(64), displayName: 'Bob', picture: null, nip05: null };
function Harness({ excluded = [] }: { excluded?: string[] }) {
  const [value, setValue] = useState('');
  return <NostrUserPicker value={value} onChange={setValue} excludedPubkeys={excluded} />;
}
function mount(excluded?: string[]) {
  render(<LocaleProvider><Harness excluded={excluded} /></LocaleProvider>);
  return screen.getByRole('textbox', { name: 'Search by name or Nostr address' });
}

describe('NostrUserPicker', () => {
  it('selects a name result as an npub and hides results after picking', () => {
    search.result = { directHit: null, nip05Hit: null, nostrResults: [alice, alice, bob], loading: false };
    const input = mount([bob.pubkey]);
    fireEvent.change(input, { target: { value: 'ali' } });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alice/ }));
    expect(input).toHaveValue(hexToNpub(alice.pubkey));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('uses keyboard selection without submitting the containing form', () => {
    search.result = { directHit: null, nip05Hit: null, nostrResults: [alice, bob], loading: false };
    const input = mount();
    fireEvent.change(input, { target: { value: 'people' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue(hexToNpub(bob.pubkey));
  });

  it('shows loading and an empty result, and Escape dismisses search', () => {
    search.result = { directHit: null, nip05Hit: null, nostrResults: [], loading: true };
    const input = mount();
    fireEvent.change(input, { target: { value: 'missing' } });
    expect(screen.getByRole('status')).toHaveTextContent('Searching people');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    search.result.loading = false;
    fireEvent.focus(input);
    expect(screen.getByRole('status')).toHaveTextContent('No matching people');
  });
});
