import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { npubEncode } from 'nostr-tools/nip19';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { setPreference } from '@/services/preferences/preferences';
import { ComposeDmScreen } from '@/app/[locale]/app/mobile/screens/dm/ComposeDmScreen';

const search = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/identity/useNostrUserSearch', () => ({ useNostrUserSearch: search }));

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const hit = (pubkey: string, displayName: string) => ({ pubkey, displayName, picture: null, nip05: null });

beforeEach(() => {
  setPreference('directMessagesEnabled', true);
  search.mockReturnValue({ directHit: null, nip05Hit: null, nostrResults: [], loading: false });
});
afterEach(() => setPreference('directMessagesEnabled', false));

function mount() {
  const back = vi.fn();
  const selectPeer = vi.fn();
  renderWithBridge(
    <ComposeDmScreen back={back} selectPeer={selectPeer} />,
    fakeBridge({ dmsByPeer: { [A]: [], [B]: [] } }),
  );
  return { back, selectPeer };
}

describe('ComposeDmScreen (phone)', () => {
  it('lists recent conversations until two characters are typed', () => {
    mount();
    expect(document.querySelectorAll('.dm-row')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('To:'), { target: { value: 'a' } });
    expect(document.querySelectorAll('.dm-row')).toHaveLength(2);
  });

  it('shows each search hit once, the direct and NIP-05 hits first', () => {
    search.mockReturnValue({ directHit: hit(A, 'Direct'), nip05Hit: hit(B, 'Nip'), nostrResults: [hit(A, 'Again'), hit(B, 'Again')], loading: false });
    mount();
    fireEvent.change(screen.getByLabelText('To:'), { target: { value: 'al' } });
    const rows = screen.getAllByTestId('mobile-user-search-result');
    expect(rows.map((r) => r.querySelector('.dm-name')?.textContent)).toEqual(['Direct', 'Nip']);
  });

  it('says it is searching, then that nothing matched', () => {
    search.mockReturnValue({ directHit: null, nip05Hit: null, nostrResults: [], loading: true });
    mount();
    fireEvent.change(screen.getByLabelText('To:'), { target: { value: 'zz' } });
    expect(document.querySelector('.compose-dm-body .empty-state-desc')).toBeInTheDocument();
  });

  it('enables Next for a pasted npub and opens that conversation', () => {
    const { selectPeer } = mount();
    const next = document.querySelector('.compose-dm-next') as HTMLButtonElement;
    expect(next).toBeDisabled();
    fireEvent.change(screen.getByLabelText('To:'), { target: { value: npubEncode(B) } });
    expect(next).not.toBeDisabled();
    expect(next).toHaveClass('active');
    fireEvent.click(next);
    expect(selectPeer).toHaveBeenCalledWith(B);
  });

  it('cancels back', () => {
    const { back } = mount();
    fireEvent.click(document.querySelector('.compose-dm-cancel')!);
    expect(back).toHaveBeenCalled();
  });
});
