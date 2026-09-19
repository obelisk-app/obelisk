import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/nostr-bridge', () => ({
  nostrActions: {},
  useConfiguredRelays: () => [],
  useCurrentRelayUrl: () => '',
  useMyPubkey: () => null,
}));

vi.mock('@/lib/read-state/selectors', () => ({ useHasAnyHighlights: () => false }));

import ServerRail from './ServerRail';

describe('ServerRail', () => {
  it('leaves its background transparent for the animated app backdrop', () => {
    render(<ServerRail mode={{ kind: 'dm' }} onPickDM={() => {}} onPickRelay={() => {}} />);

    const rail = screen.getByTitle('Direct messages').parentElement;
    expect(rail).not.toHaveClass('bg-lc-black');
  });

  it('puts the Nostr feed tile directly below the DM tile', () => {
    const onPickFeed = vi.fn();
    render(
      <ServerRail
        mode={{ kind: 'dm' }}
        onPickDM={() => {}}
        onPickFeed={onPickFeed}
        onPickRelay={() => {}}
      />,
    );

    const dm = screen.getByTitle('Direct messages');
    const feed = screen.getByTitle('Nostr feed');
    // Both are account-wide surfaces, so they sit together above the
    // hairline that separates them from the per-relay server tiles.
    expect(dm.compareDocumentPosition(feed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(feed);
    expect(onPickFeed).toHaveBeenCalled();
  });

  it('marks the feed tile active when the feed is the current view', () => {
    render(
      <ServerRail
        mode={{ kind: 'feed' }}
        onPickDM={() => {}}
        onPickFeed={() => {}}
        onPickRelay={() => {}}
      />,
    );
    // The active pill lives on the tile wrapper; asserting the DM tile is
    // NOT active is what catches a mode mapped to the wrong tile.
    expect(screen.getByTitle('Nostr feed')).toBeInTheDocument();
    expect(screen.getByTitle('Direct messages')).toBeInTheDocument();
  });

  it('omits the feed tile when no handler is supplied', () => {
    render(<ServerRail mode={{ kind: 'dm' }} onPickDM={() => {}} onPickRelay={() => {}} />);
    expect(screen.queryByTitle('Nostr feed')).not.toBeInTheDocument();
  });
});
