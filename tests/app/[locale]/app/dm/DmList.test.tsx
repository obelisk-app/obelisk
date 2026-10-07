import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsDirectMessage } from '@/services/nostr-bridge';

vi.mock('@/services/social/profiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/social/profiles')>()),
  ensureSocialProfiles: vi.fn(async () => {}),
}));
vi.mock('@/hooks/identity/useNostrUserSearch', () => ({
  useNostrUserSearch: () => ({ directHit: null, nip05Hit: null, nostrResults: [], loading: false }),
}));

import DmList from '@/app/[locale]/app/dm/DmList';
import { setDmOptInEnabled } from '@/services/chat/dm/opt-in';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

const dm = (peer: string, content: string, createdAt: number, outgoing = false): JsDirectMessage => ({
  id: `${peer}-${createdAt}`,
  counterparty: peer,
  content,
  createdAt,
  outgoing,
} as JsDirectMessage);

const contacts = (...pubkeys: string[]) => ({ kind: 3, tags: pubkeys.map((p) => ['p', p]), content: '', created_at: 1, pubkey: 'f'.repeat(64), id: 'c', sig: 's' });

function renderList(dmsByPeer: Record<string, JsDirectMessage[]>, follows: string[] = [], onPick = vi.fn(), activePeer: string | null = null) {
  const fake = fakeBridge(
    { dmsByPeer, myContactList: contacts(...follows) as never },
    { disableDirectMessages: vi.fn() },
  );
  renderWithBridge(<DmList activePeer={activePeer} onPick={onPick} />, fake);
  return { onPick };
}

describe('DmList', () => {
  beforeEach(() => setDmOptInEnabled(true));
  afterEach(() => setDmOptInEnabled(false));

  it('opens on Follows when a follow has written, and counts both tabs', () => {
    renderList({ [ALICE]: [dm(ALICE, 'hi alice', 10)], [BOB]: [dm(BOB, 'hi bob', 20)] }, [ALICE]);
    expect(screen.getByTestId('dm-tab-follows')).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByTestId('dm-tab-follows')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByTestId('dm-tab-others')).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('hi alice')).toBeInTheDocument();
    expect(screen.queryByText('hi bob')).toBeNull();
    fireEvent.click(screen.getByTestId('dm-tab-others'));
    expect(screen.getByText('hi bob')).toBeInTheDocument();
  });

  it('opens on Others when no follow has written', () => {
    renderList({ [BOB]: [dm(BOB, 'hi bob', 20)] }, [ALICE]);
    expect(screen.getByTestId('dm-tab-others')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByTestId('dm-tab-follows'));
    expect(screen.getByText('None of your follows have messaged you yet')).toBeInTheDocument();
  });

  it('says when everyone is in Follows', () => {
    renderList({ [ALICE]: [dm(ALICE, 'hi', 10)] }, [ALICE]);
    fireEvent.click(screen.getByTestId('dm-tab-others'));
    expect(screen.getByText("Everyone you've messaged is in Follows")).toBeInTheDocument();
  });

  it('lists the newest conversation first and previews the last message', () => {
    renderList({
      [ALICE]: [dm(ALICE, 'old', 10)],
      [BOB]: [dm(BOB, 'first', 5), dm(BOB, `  sent\n\nby   me ${'x'.repeat(80)}`, 30, true)],
    });
    const previews = screen.getAllByText(/old|You:/).map((p) => p.textContent);
    // Whitespace runs collapse to one space (a leading run too), then 60 characters.
    expect(previews[0]).toBe(`You: ${` sent by me ${'x'.repeat(80)}`.slice(0, 60)}`);
    expect(previews[1]).toBe('old');
  });

  it('opens the picked conversation', () => {
    const { onPick } = renderList({ [BOB]: [dm(BOB, 'hi bob', 20)] });
    fireEvent.click(screen.getByText('hi bob'));
    expect(onPick).toHaveBeenCalledWith(BOB);
  });

  it('with no conversations offers to start one, which opens the search', () => {
    renderList({});
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.queryByTestId('dm-composer-search')).toBeNull();
    fireEvent.click(screen.getByText('Start a conversation'));
    expect(screen.getByTestId('dm-composer-search')).toBeInTheDocument();
  });

  it('the search button toggles the composer, and Escape closes it', () => {
    renderList({});
    const toggle = screen.getByRole('button', { name: 'New DM' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(screen.getByTestId('dm-compose-input'), { key: 'Escape' });
    expect(screen.queryByTestId('dm-composer-search')).toBeNull();
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(screen.queryByTestId('dm-composer-search')).toBeNull();
  });

  it('explains where the DM cache lives instead of clearing it', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    renderList({});
    fireEvent.click(screen.getByRole('button', { name: 'Clear DM cache' }));
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('Settings > Data on this device'));
    alert.mockRestore();
  });

  it('marks unread conversations with a capped count', () => {
    const now = Math.floor(Date.now() / 1000);
    const many = Array.from({ length: 120 }, (_, i) => dm(BOB, `m${i}`, now - 120 + i));
    renderList({ [BOB]: many });
    expect(screen.getByText('99+')).toBeInTheDocument();
  });
});
