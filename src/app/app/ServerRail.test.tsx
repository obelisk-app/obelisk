import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const relays = { list: [] as string[] };

vi.mock('@/lib/nostr-bridge', () => ({
  nostrActions: {},
  useConfiguredRelays: () => relays.list,
  useCurrentRelayUrl: () => '',
  useMyPubkey: () => null,
}));

vi.mock('@/lib/relay-info', () => ({
  faviconFor: () => null,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
  SUGGESTED_RELAYS: [],
}));

vi.mock('@/lib/read-state/selectors', () => ({ useHasAnyHighlights: () => false }));

import ServerRail from './ServerRail';
import { useHintsStore } from '@/store/hints';
import { LocaleProvider } from '@/i18n/context';

/**
 * The rail speaks the app's language now, so its titles come from the
 * dictionary rather than the source. Pin English so the assertions read
 * as the strings a reader would see.
 */
const renderRail = (ui: React.ReactElement) =>
  render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('ServerRail', () => {
  it('leaves its background transparent for the animated app backdrop', () => {
    renderRail(<ServerRail mode={{ kind: 'dm' }} onPickDM={() => {}} onPickRelay={() => {}} />);

    const rail = screen.getByTitle('Direct messages').parentElement;
    expect(rail).not.toHaveClass('bg-lc-black');
  });

  it('puts the Nostr feed tile directly below the DM tile', () => {
    const onPickFeed = vi.fn();
    renderRail(<ServerRail
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
    renderRail(<ServerRail
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
    renderRail(<ServerRail mode={{ kind: 'dm' }} onPickDM={() => {}} onPickRelay={() => {}} />);
    expect(screen.queryByTitle('Nostr feed')).not.toBeInTheDocument();
  });
});

describe('first-run anchors', () => {
  beforeEach(() => {
    relays.list = [];
    useHintsStore.setState({ seen: [], muted: false });
  });

  it('anchors every rail hint the registry expects to find here', () => {
    // The anchors are applied through a prop rather than written inline, so
    // a typo would silently leave a hint pointing at nothing.
    relays.list = ['wss://relay.example'];
    renderRail(<ServerRail
        mode={{ kind: 'dm' }}
        onPickDM={() => {}}
        onPickFeed={() => {}}
        onPickRelay={() => {}}
      />,
    );

    for (const anchor of ['rail-dm', 'rail-feed', 'rail-relay', 'rail-add-relay']) {
      expect(document.querySelector(`[data-tour="${anchor}"]`), anchor).not.toBeNull();
    }
  });

  it('dots the controls a newcomer has not met', () => {
    relays.list = ['wss://relay.example'];
    renderRail(<ServerRail mode={{ kind: 'dm' }} onPickDM={() => {}} onPickFeed={() => {}} onPickRelay={() => {}} />);
    expect(screen.getAllByTestId('hint-dot').length).toBeGreaterThan(0);
  });

  it('marks only the first relay, not every one of them', () => {
    // A dot on each would read as unread traffic on each.
    relays.list = ['wss://one.example', 'wss://two.example', 'wss://three.example'];
    renderRail(<ServerRail mode={{ kind: 'relay', url: 'wss://one.example' }} onPickDM={() => {}} onPickRelay={() => {}} />);
    expect(document.querySelectorAll('[data-tour="rail-relay"]')).toHaveLength(1);
  });

  it('drops the dots once the hints are seen', () => {
    relays.list = ['wss://relay.example'];
    useHintsStore.setState({ seen: ['rail-dm', 'rail-feed', 'rail-relay'] });
    renderRail(<ServerRail mode={{ kind: 'dm' }} onPickDM={() => {}} onPickFeed={() => {}} onPickRelay={() => {}} />);
    expect(screen.queryAllByTestId('hint-dot')).toHaveLength(0);
  });
});

describe('speaks the reader\'s language', () => {
  it('translates the rail tiles', () => {
    // The rail had no `useTranslation` at all: "Direct messages", "Add
    // relay" and the remove confirmation were English in the Spanish build
    // too.
    relays.list = ['wss://relay.example'];
    render(
      <LocaleProvider initialLocale="pt">
        <ServerRail mode={{ kind: 'dm' }} onPickDM={() => {}} onPickFeed={() => {}} onPickRelay={() => {}} />
      </LocaleProvider>,
    );

    expect(screen.getByTitle('Mensagens diretas')).toBeInTheDocument();
    expect(screen.getByTitle('Feed do Nostr')).toBeInTheDocument();
    expect(screen.getByTitle('Adicionar relay')).toBeInTheDocument();
  });
});
