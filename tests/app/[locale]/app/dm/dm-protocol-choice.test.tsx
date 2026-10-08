vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  const { userMetadataFixture } = await import('@tests/support/mocks/nostr-bridge');
  const readProfile: typeof import('@/services/nostr-bridge')['useUserMetadata'] = () => userMetadataFixture({ displayName: 'Bob' });
  return sessionMock({
    useMyPubkey: () => ME,
    useSessionProfile: () => readProfile((() => ME)()),
  });
});
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

/**
 * The per-thread NIP-17 / NIP-04 choice, on both DM headers.
 *
 * NIP-04 is a per-thread opt-out the user picks (docs/features/direct-messages.md),
 * but the prompt that called `setProtocolOverride` was deleted with an old DM
 * view and never replaced, so nobody could pick it. Both shells share
 * `useDmProtocolChoice`; these tests drive each shell's header.
 */

const ME = 'a'.repeat(64);
const PEER = 'b'.repeat(64);

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock, userMetadataFixture } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({

    useUserMetadata: () => userMetadataFixture({ displayName: 'Bob' }),
    useDirectMessages: () => ({}),
    getBridgeImpl: () => null,
  });
});
vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: () => ({
    displayName: 'Bob', name: null, picture: null,
    nip05: null, about: null, banner: null, lud16: null,
  }),
}));
vi.mock('@/services/chat/pq/attestations', () => ({
  hasUsableKeys: vi.fn().mockResolvedValue(false),
  getAttestation: vi.fn(),
  clearAttestationCache: vi.fn(),
}));
vi.mock('@/components/call/DmCallButtons', () => ({ DmCallButtons: () => null }));

import { DmPanel } from '@/app/[locale]/app/panes/dm/DmPanel';
import { DmThreadScreen } from '@/app/[locale]/app/mobile/screens/dm/DmThreadScreen';
import { useDMStore, type DMProtocol } from '@/store/chat/dm';

const SHELLS: Array<[string, () => ReactNode]> = [
  ['desktop', () => <DmPanel peer={PEER} onPickPeer={() => {}} />],
  ['phone', () => <DmThreadScreen peer={PEER} back={() => {}} openProfile={() => {}} />],
];

let setOverride: ReturnType<typeof vi.fn<(pubkey: string, protocol: DMProtocol) => void>>;

beforeEach(() => {
  // Same effect as the store's own action, recorded fresh per test.
  setOverride = vi.fn<(pubkey: string, protocol: DMProtocol) => void>((pubkey, protocol) =>
    useDMStore.setState((s) => ({ protocolOverrides: { ...s.protocolOverrides, [pubkey]: protocol } })));
  useDMStore.setState({ protocolOverrides: {}, setProtocolOverride: setOverride });
});

afterEach(() => {
  useDMStore.setState({ protocolOverrides: {} });
});

const selected = (testId: string) => screen.getByTestId(testId).getAttribute('aria-selected');

describe.each(SHELLS)('%s DM header protocol switch', (_name, ui) => {
  const mount = () => render(<LocaleProvider initialLocale="en">{ui()}</LocaleProvider>);

  it('defaults to NIP-17 when the thread has no override', () => {
    mount();
    expect(selected('dm-protocol-nip17')).toBe('true');
    expect(selected('dm-protocol-nip04')).toBe('false');
  });

  it('explains NIP-04 before switching, then stores the choice for this peer', () => {
    mount();
    fireEvent.click(screen.getByTestId('dm-protocol-nip04'));
    expect(screen.getByTestId('dm-protocol-notice').textContent).toMatch(/who is talking to whom/);
    expect(setOverride).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('dm-protocol-confirm'));
    expect(setOverride).toHaveBeenCalledWith(PEER, 'nip04');
    expect(selected('dm-protocol-nip04')).toBe('true');
    expect(screen.queryByTestId('dm-protocol-notice')).toBeNull();
  });

  it('keeps NIP-17 when the explanation is declined', () => {
    mount();
    fireEvent.click(screen.getByTestId('dm-protocol-nip04'));
    fireEvent.click(screen.getByTestId('dm-protocol-keep'));
    expect(setOverride).not.toHaveBeenCalled();
    expect(selected('dm-protocol-nip17')).toBe('true');
    expect(screen.queryByTestId('dm-protocol-notice')).toBeNull();
  });

  it('switches back to NIP-17 at once, with no warning', () => {
    useDMStore.setState({ protocolOverrides: { [PEER]: 'nip04' } });
    mount();
    expect(selected('dm-protocol-nip04')).toBe('true');
    fireEvent.click(screen.getByTestId('dm-protocol-nip17'));
    expect(setOverride).toHaveBeenCalledWith(PEER, 'nip17');
    expect(screen.queryByTestId('dm-protocol-notice')).toBeNull();
    expect(selected('dm-protocol-nip17')).toBe('true');
  });
});

describe('phone DM header label', () => {
  it('names the protocol the thread sends with', () => {
    render(<LocaleProvider initialLocale="en"><DmThreadScreen peer={PEER} back={() => {}} openProfile={() => {}} /></LocaleProvider>);
    expect(screen.getByTestId('dm-header-protocol').textContent).toBe('NIP-17');
    fireEvent.click(screen.getByTestId('dm-protocol-nip04'));
    fireEvent.click(screen.getByTestId('dm-protocol-confirm'));
    expect(screen.getByTestId('dm-header-protocol').textContent).toBe('NIP-04');
  });
});
