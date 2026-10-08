import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import FeedSearchPerson from '@/components/social/feed/FeedSearchPerson';
import { ComposeUserRow } from '@/app/[locale]/app/mobile/screens/dm/ComposeUserRow';

const author = vi.hoisted(() => ({ displayName: 'Resolved Person', name: null, picture: null, nip05: 'person@example.com' } as Record<string, string | null>));
const verification = vi.hoisted(() => ({ state: 'unchecked' }));
vi.mock('@/hooks/social/profile/useAuthor', () => ({ useAuthor: () => author }));
vi.mock('@/hooks/identity/useNip05Status', () => ({ useNip05Status: () => verification.state }));
const hit = { pubkey: 'a'.repeat(64), displayName: null, picture: null, nip05: null };

describe('shared identity search results', () => {
  beforeEach(() => {
    author.displayName = 'Resolved Person';
    author.nip05 = 'person@example.com';
    verification.state = 'unchecked';
  });
  it('resolves a pasted key on mobile and keeps its click action', () => {
    const onClick = vi.fn();
    renderWithBridge(<ComposeUserRow hit={hit} onClick={onClick} />, fakeBridge());
    expect(screen.getByText('Resolved Person')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('mobile-user-search-result'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps a public-key cue when a result has no profile or handle', () => {
    author.displayName = null;
    author.nip05 = null;
    renderWithBridge(<FeedSearchPerson hit={hit} onOpen={vi.fn()} />, fakeBridge());
    expect(screen.getByText(/^npub1/)).toBeInTheDocument();
  });

  it('only highlights a social handle when its claim has been verified', () => {
    verification.state = 'unchecked';
    const onOpen = vi.fn();
    const view = renderWithBridge(<FeedSearchPerson hit={hit} onOpen={onOpen} />, fakeBridge());
    expect(screen.getByText('person@example.com')).not.toHaveClass('text-lc-green');
    verification.state = 'verified';
    view.rerender(<FeedSearchPerson hit={hit} onOpen={onOpen} />);
    expect(screen.getByText('person@example.com')).toHaveClass('text-lc-green');
    fireEvent.click(screen.getByTestId('search-person'));
    expect(onOpen).toHaveBeenCalledWith(hit.pubkey);
  });
});
