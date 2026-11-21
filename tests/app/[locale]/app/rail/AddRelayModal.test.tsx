import { buildInviteLink } from '@applesauce/concord/helpers';
import type { ConcordClient } from '@applesauce/concord/client';
import { captureConcordInviteFragment, clearPendingConcordInvite } from '@/services/chat/concord/pending-invite';
import { ConcordContext } from '@/contexts/chat/concord';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getConcordForBridge = vi.hoisted(() => vi.fn());
vi.mock('@/services/nostr-bridge', async importOriginal => ({
  ...await importOriginal<typeof import('@/services/nostr-bridge')>(),
  getConcordForBridge,
}));

afterEach(() => {
  clearPendingConcordInvite();
  getConcordForBridge.mockReset();
});

const info = vi.hoisted(() => ({
  byUrl: {
    'wss://one.example': { name: 'One', description: 'The first relay', icon: 'https://one.example/i.png' },
  } as Record<string, { name?: string; description?: string; icon?: string }>,
}));
vi.mock('@/services/relay/relay-info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/relay/relay-info')>()),
  SUGGESTED_RELAYS: [{ url: 'wss://one.example' }, { url: 'wss://two.example' }],
  fetchRelayInfo: vi.fn(async (url: string) => info.byUrl[url] ?? null),
}));

import { AddRelayModal } from '@/app/[locale]/app/rail/AddRelayModal';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

function mount(methods: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const fake = fakeBridge({ configuredRelays: ['wss://two.example'] }, methods);
  renderWithBridge(<AddRelayModal onClose={onClose} />, fake);
  return { onClose };
}

const rowOf = (url: string) => screen.getByTestId(`suggested-community-${new URL(url).host}`);

describe('AddRelayModal', () => {
  it('opens on the suggestions, named from NIP-11, and marks the ones already added', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('One')).toBeInTheDocument());
    expect(screen.getByText('The first relay')).toBeInTheDocument();
    // No NIP-11 name: the host stands in, and the description says there is none.
    expect(screen.getByText('two.example')).toBeInTheDocument();
    const added = rowOf('wss://two.example').querySelector('button')!;
    expect(added).toHaveTextContent('Added');
    expect(added).toBeDisabled();
  });

  it('shows the relay icon, and the host letters on a tinted tile when it fails', async () => {
    mount();
    const img = await waitFor(() => {
      const found = rowOf('wss://one.example').querySelector('img');
      expect(found).not.toBeNull();
      return found!;
    });
    expect(img.getAttribute('src')).toBe('https://one.example/i.png');
    fireEvent.error(img);
    expect(rowOf('wss://one.example').querySelector('img')).toBeNull();
  });

  it('adds a suggested relay without switching, then closes', async () => {
    const addRelay = vi.fn().mockResolvedValue(undefined);
    const switchRelay = vi.fn();
    const { onClose } = mount({ addRelay, switchRelay });
    await act(async () => { fireEvent.click(rowOf('wss://one.example').querySelector('button')!); });
    expect(addRelay).toHaveBeenCalledWith('wss://one.example');
    expect(switchRelay).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('joins and switches to a typed community address', async () => {
    const addRelay = vi.fn().mockResolvedValue(undefined);
    const switchRelay = vi.fn().mockResolvedValue(undefined);
    const { onClose } = mount({ addRelay, switchRelay });
    const field = screen.getByLabelText('Relay URL or invite link');
    expect(field).toHaveValue('');
    fireEvent.change(field, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Join community' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'custom.example' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Join community' })); });
    expect(addRelay).toHaveBeenCalledWith('wss://custom.example');
    expect(switchRelay).toHaveBeenCalledWith('wss://custom.example');
    expect(onClose).toHaveBeenCalled();
  });

  it('routes a private invitation without asking the user to choose a protocol', async () => {
    const onClose = vi.fn();
    const joinByLink = vi.fn().mockResolvedValue({ communityId: 'joined' });
    renderWithBridge(
      <ConcordContext.Provider value={{ client: { joinByLink } as unknown as ConcordClient, communities: [], error: null }}>
        <AddRelayModal onClose={onClose} />
      </ConcordContext.Provider>,
      fakeBridge(),
    );
    const link = buildInviteLink('https://obelisk.example', 'a'.repeat(64), new Uint8Array(16), ['wss://chat.example']);
    fireEvent.change(screen.getByTestId('community-join-link'), { target: { value: link } });
    await act(async () => { fireEvent.click(screen.getByTestId('community-join')); });
    expect(joinByLink).toHaveBeenCalledWith(link);
    expect(onClose).toHaveBeenCalled();
  });

  it.each([false, true])('joins on the first click while Concord starts (prefilled: %s)', async fromInvite => {
    const link = buildInviteLink('https://obelisk.example', 'a'.repeat(64), new Uint8Array(16), ['wss://chat.example']);
    const joinByLink = vi.fn().mockResolvedValue({ communityId: 'joined' });
    let finishStartup!: (value: { client: { joinByLink: typeof joinByLink } }) => void;
    getConcordForBridge.mockReturnValue(new Promise(resolve => { finishStartup = resolve; }));
    if (fromInvite) {
      window.history.replaceState(null, '', '#' + new URLSearchParams({ 'concord-invite': link }));
      captureConcordInviteFragment();
    }
    const onClose = vi.fn();
    renderWithBridge(<AddRelayModal onClose={onClose} fromInvite={fromInvite} />, fakeBridge());
    const field = screen.getByTestId('community-join-link');
    if (!fromInvite) fireEvent.change(field, { target: { value: link } });
    expect(field).toHaveValue(link);
    const submit = screen.getByTestId('community-join');
    fireEvent.click(submit);
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent('Connecting…');
    expect(joinByLink).not.toHaveBeenCalled();
    await act(async () => { finishStartup({ client: { joinByLink } }); });
    expect(joinByLink).toHaveBeenCalledExactlyOnceWith(link);
    expect(onClose).toHaveBeenCalled();
  });

  it('opens a separate creation screen and returns to joining', () => {
    mount();
    fireEvent.click(screen.getByTestId('create-community-option'));
    expect(screen.getByText('Create a community')).toBeInTheDocument();
    expect(screen.queryByTestId('community-join-link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('community-join-link')).toBeInTheDocument();
    expect(rowOf('wss://one.example')).toBeInTheDocument();
  });
});
