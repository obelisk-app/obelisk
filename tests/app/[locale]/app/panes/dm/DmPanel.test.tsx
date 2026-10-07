/**
 * The desktop DM thread: the empty states, the header, day dividers,
 * bubbles (pending, failed with retry and dismiss), and the "this thread is
 * open" mark it leaves in the DM store for the read cursor. The
 * post-quantum indicators are pinned in `DmPanel.pq.test.tsx`.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { DmPanel } from '@/app/[locale]/app/panes/dm/DmPanel';
import { useDMStore } from '@/store/chat/dm';
import { useChatStore } from '@/store/chat';
import type { JsDirectMessage } from '@/services/nostr-bridge';
import { setPreference } from '@/services/preferences/preferences';

const PEER = 'b'.repeat(64);

// The peer resolves through the social tier (`useAuthor`), which would open
// real sockets to public relays from jsdom.
vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: () => ({ displayName: 'Bob', name: null, picture: null, nip05: 'bob@x.test', about: null, banner: null, lud16: null }),
}));
vi.mock('@/services/chat/pq/attestations', () => ({
  hasUsableKeys: vi.fn().mockResolvedValue(false),
  getAttestation: vi.fn(),
  clearAttestationCache: vi.fn(),
}));

const DAY = 86_400;
function dm(over: Partial<JsDirectMessage> & { id: string }): JsDirectMessage {
  return { counterparty: PEER, outgoing: false, content: over.id, createdAt: 1_700_000_000, protocol: 'nip17', ...over } as JsDirectMessage;
}

function mount(peer: string | null, messages: JsDirectMessage[] = [], methods = {}) {
  return renderWithBridge(<DmPanel peer={peer} onPickPeer={() => {}} />, fakeBridge({ dmsByPeer: { [PEER]: messages } }, methods));
}

beforeEach(() => {
  useDMStore.setState({ activeDMPubkey: null });
  // Until the person opts in to DMs the bridge's DM hook reads nothing.
  setPreference('directMessagesEnabled', true);
});

afterEach(() => setPreference('directMessagesEnabled', false));

describe('DmPanel', () => {
  it('asks to pick a conversation when none is open', () => {
    mount(null);
    expect(screen.getByText('Pick or start a DM conversation.')).toBeInTheDocument();
  });

  it('says the thread is empty and encrypted', () => {
    mount(PEER);
    expect(screen.getByText('No messages yet. Send the first one, end-to-end encrypted.')).toBeInTheDocument();
  });

  it('heads the thread with the peer name and NIP-05, and opens their profile', () => {
    const openProfilePopup = vi.fn();
    useChatStore.setState({ openProfilePopup } as never);
    mount(PEER);
    const header = screen.getByTestId('dm-thread-header');
    expect(header.textContent).toContain('Bob');
    expect(header.textContent).toContain('bob@x.test');
    fireEvent.click(within(header).getByText('Bob'), { clientX: 4, clientY: 5 });
    expect(openProfilePopup).toHaveBeenCalledWith(PEER, { x: 4, y: 5 });
  });

  it('marks the open thread in the DM store, and clears it when the panel goes', () => {
    const view = mount(PEER);
    expect(useDMStore.getState().activeDMPubkey).toBe(PEER);
    view.unmount();
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
  });

  it('leaves another thread\'s mark alone on unmount', () => {
    const view = mount(PEER);
    act(() => useDMStore.setState({ activeDMPubkey: 'c'.repeat(64) }));
    view.unmount();
    expect(useDMStore.getState().activeDMPubkey).toBe('c'.repeat(64));
  });

  it('puts a divider between days and draws outgoing bubbles in green', async () => {
    mount(PEER, [
      dm({ id: 'monday' }),
      dm({ id: 'tuesday', createdAt: 1_700_000_000 + DAY, outgoing: true }),
    ]);
    await screen.findByText('tuesday');
    expect(screen.getAllByTestId('dm-day-divider')).toHaveLength(2);
    expect(screen.getByText('tuesday').closest('.rounded-2xl')!.className).toContain('bg-lc-green');
    expect(screen.getByText('monday').closest('.rounded-2xl')!.className).toContain('bg-lc-card');
  });

  it('shows a sending spinner on a pending message, faded', async () => {
    mount(PEER, [dm({ id: 'wait', outgoing: true, pending: true })]);
    const bubble = (await screen.findByText('wait')).closest('.rounded-2xl')!;
    expect(bubble.className).toContain('opacity-60');
    expect(within(bubble as HTMLElement).getByRole('status', { name: 'Sending' })).toBeInTheDocument();
  });

  it('offers retry and dismiss on a failed send', async () => {
    const retryDirectMessage = vi.fn(async () => {});
    const cancelPendingDirectMessage = vi.fn();
    mount(PEER, [dm({ id: 'oops', outgoing: true, failed: true, clientTag: 'tag1' })], { retryDirectMessage, cancelPendingDirectMessage });
    const failed = await screen.findByTestId('dm-failed');
    expect(failed.textContent).toContain('Couldn’t send');
    expect(screen.getByText('oops').closest('.rounded-2xl')!.className).toContain('ring-red-500/60');
    fireEvent.click(screen.getByTestId('dm-retry'));
    await waitFor(() => expect(retryDirectMessage).toHaveBeenCalledWith(PEER, 'tag1'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss failed message' }));
    await waitFor(() => expect(cancelPendingDirectMessage).toHaveBeenCalledWith(PEER, 'tag1'));
  });
});
