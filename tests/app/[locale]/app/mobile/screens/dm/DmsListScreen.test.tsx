import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import type { JsDirectMessage } from '@/services/nostr-bridge';
import { setPreference } from '@/services/preferences/preferences';
import { DmsListScreen } from '@/app/[locale]/app/mobile/screens/dm/DmsListScreen';
import { MobileDmOptInScreen } from '@/app/[locale]/app/mobile/screens/dm/MobileDmOptInScreen';

const ensure = vi.hoisted(() => vi.fn());
vi.mock('@/services/social/profiles', async (orig) => ({
  ...(await orig<typeof import('@/services/social/profiles')>()),
  ensureSocialProfiles: ensure,
}));

const FRIEND = 'f'.repeat(63) + '1';
const STRANGER = 'e'.repeat(64);
const QUIET = 'd'.repeat(64);
const dm = (counterparty: string, createdAt: number, over: Partial<JsDirectMessage> = {}): JsDirectMessage =>
  ({ id: `${counterparty}-${createdAt}`, counterparty, outgoing: false, content: `msg ${createdAt}`, createdAt, ...over });

beforeEach(() => setPreference('directMessagesEnabled', true));
afterEach(() => setPreference('directMessagesEnabled', false));

function mount() {
  const go = vi.fn();
  const selectPeer = vi.fn();
  renderWithBridge(
    <DmsListScreen go={go} selectPeer={selectPeer} myFollows={[FRIEND]} />,
    fakeBridge({
      dmsByPeer: {
        [FRIEND]: [dm(FRIEND, 100), dm(FRIEND, 300, { outgoing: true, content: 'latest' }), dm(FRIEND, 200)],
        [STRANGER]: [dm(STRANGER, 250)],
        [QUIET]: [],
      },
      userMetadata: { [FRIEND]: { name: 'Fran' } as never },
    }),
  );
  return { go, selectPeer };
}

describe('DmsListScreen (phone)', () => {
  it('shows the people you follow first, with the latest message and your prefix', () => {
    mount();
    const tabs = document.querySelectorAll('.filter-tab');
    expect(tabs[0]).toHaveTextContent('Follows · 1');
    expect(tabs[0]).toHaveClass('active');
    expect(tabs[1]).toHaveTextContent('Others · 1');
    const rows = document.querySelectorAll('.dm-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Fran');
    expect(rows[0].querySelector('.dm-preview')).toHaveTextContent('You: latest');
  });

  it('switches to everyone else and opens a conversation', () => {
    const { selectPeer } = mount();
    fireEvent.click(document.querySelectorAll('.filter-tab')[1]);
    const rows = document.querySelectorAll('.dm-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('.dm-preview')).toHaveTextContent('msg 250');
    fireEvent.click(rows[0]);
    expect(selectPeer).toHaveBeenCalledWith(STRANGER);
  });

  it('asks for every listed profile in one batch', () => {
    ensure.mockClear();
    mount();
    expect(ensure).toHaveBeenCalledWith([FRIEND, STRANGER]);
  });

  it('opens a new conversation from the + button', () => {
    const { go } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'New message' }));
    expect(go).toHaveBeenCalledWith('compose-dm');
  });
});

describe('MobileDmOptInScreen', () => {
  it('shows the opt-in gate under the DMs title', () => {
    const onSecondary = vi.fn();
    renderWithBridge(<MobileDmOptInScreen onSecondary={onSecondary} secondaryLabel="Back" />, fakeBridge());
    expect(document.querySelector('[data-screen="dms-list"] h2')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onSecondary).toHaveBeenCalled();
  });
});
