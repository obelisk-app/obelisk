import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DMList from './DMList';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notification';

const clearAccountMock = vi.fn();
vi.mock('@/lib/dm/dm-cache', () => ({
  clearAccount: (pk: string) => clearAccountMock(pk),
}));

// DMThreadRow now reads via `useProfile` / `useLastDM`. Stub both providers
// so DMList tests don't need a wrapping <DMSessionProvider> tree (each
// returns null/[], the row falls back to thread.displayName + thread.lastMessage).
vi.mock('@/components/ProfileProvider', () => ({
  useProfile: () => null,
}));
vi.mock('@/components/dm/DMSessionProvider', () => ({
  useLastDM: () => null,
}));

// Drive the reactive `signerReady` flag directly on the auth store —
// DMList now reads via `useIdentity()` instead of polling `getNDK().signer`
// at render time. Mocking the NDK singleton no longer matters for the
// signer-gate; the auth store flag is what gates the UI.
function setSignerReady(ready: boolean): void {
  useAuthStore.setState({ signerReady: ready });
}

describe('DMList', () => {
  beforeEach(() => {
    useDMStore.setState({
      isDMMode: false,
      activeDMPubkey: null,
      threads: [],
      messages: [],
      isLoadingMessages: false,
      isLoadingThreads: false,
      hasMoreHistory: false,
      protocolOverrides: {},
      showProtocolPrompt: null,
    });
    useNotificationStore.setState(useNotificationStore.getInitialState());
    // Default: signer present, so existing tests still see an enabled CTA.
    setSignerReady(true);
  });

  it('shows empty state', () => {
    render(<DMList />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('shows loading skeleton while isLoadingThreads and no threads cached', () => {
    useDMStore.setState({ isLoadingThreads: true, threads: [] });
    const { container } = render(<DMList />);
    expect(screen.getByText(/Loading DMs from relays/i)).toBeInTheDocument();
    expect(container.querySelectorAll('.lc-skeleton-circle').length).toBeGreaterThan(0);
    // empty-state text should NOT appear while loading
    expect(screen.queryByText('No conversations yet')).not.toBeInTheDocument();
  });

  it('renders threads', () => {
    useDMStore.setState({
      threads: [
        { pubkey: 'pk1', displayName: 'Alice', unreadCount: 0 },
        { pubkey: 'pk2', displayName: 'Bob', lastMessage: 'Hey!', unreadCount: 0 },
      ],
    });
    useNotificationStore.setState({ dmUnreads: { pk2: 3 } });

    render(<DMList />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Hey!')).toBeInTheDocument();
    // Two `3` badges now: per-thread (Bob) + the active-tab total.
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });

  it('opens the inline composer above the thread list when + is clicked', async () => {
    const user = userEvent.setup();
    render(<DMList />);
    await user.click(screen.getByTestId('new-dm-cta'));
    expect(screen.getByTestId('dm-composer')).toBeInTheDocument();
    // Tabs and thread list stay visible — composer coexists with them.
    expect(screen.getByTestId('dm-tabs')).toBeInTheDocument();
  });

  it('closes the composer when its close button is clicked', async () => {
    const user = userEvent.setup();
    render(<DMList />);
    await user.click(screen.getByTestId('new-dm-cta'));
    await user.click(screen.getByTestId('dm-composer-cancel'));
    expect(screen.queryByTestId('dm-composer')).not.toBeInTheDocument();
    expect(screen.getByTestId('dm-tabs')).toBeInTheDocument();
  });

  it('does not render a refresh button (polling handles refresh)', () => {
    render(<DMList />);
    expect(screen.queryByTestId('dm-refresh-btn')).not.toBeInTheDocument();
  });

  it('selects a thread', async () => {
    useDMStore.setState({
      threads: [{ pubkey: 'pk1', displayName: 'Alice', unreadCount: 0 }],
    });

    const user = userEvent.setup();
    render(<DMList />);
    await user.click(screen.getByText('Alice'));
    expect(useDMStore.getState().activeDMPubkey).toBe('pk1');
  });
});

describe('DMList signer gate', () => {
  beforeEach(() => {
    useDMStore.setState({
      isDMMode: false,
      activeDMPubkey: null,
      threads: [],
      messages: [],
      isLoadingMessages: false,
      isLoadingThreads: false,
      hasMoreHistory: false,
      protocolOverrides: {},
      showProtocolPrompt: null,
    });
    useNotificationStore.setState(useNotificationStore.getInitialState());
  });

  it('disables the New DM CTA when signerReady is false', () => {
    setSignerReady(false);
    render(<DMList />);
    expect(screen.getByTestId('new-dm-cta')).toBeDisabled();
    // Sanity: the empty-state CTA is also gated.
    expect(screen.getByTestId('new-dm-cta-empty')).toBeDisabled();
  });

  it('enables the New DM CTA when signerReady is true', () => {
    setSignerReady(true);
    render(<DMList />);
    expect(screen.getByTestId('new-dm-cta')).not.toBeDisabled();
  });

  it('does not open the composer when CTA is disabled (no signer)', async () => {
    setSignerReady(false);
    const user = userEvent.setup();
    render(<DMList />);
    await user.click(screen.getByTestId('new-dm-cta'));
    expect(screen.queryByTestId('dm-composer')).not.toBeInTheDocument();
  });

  it('reactively re-enables the CTA when signerReady flips after mount', () => {
    // Cold-start race that motivated this refactor: DMList mounts before
    // the signer is restored; once the bridge fires, the CTA enables.
    setSignerReady(false);
    render(<DMList />);
    expect(screen.getByTestId('new-dm-cta')).toBeDisabled();
    act(() => { setSignerReady(true); });
    expect(screen.getByTestId('new-dm-cta')).not.toBeDisabled();
  });

  describe('clear DM cache', () => {
    beforeEach(() => {
      clearAccountMock.mockClear();
      useAuthStore.setState({ profile: { pubkey: 'a'.repeat(64), npub: '' } as any });
      useDMStore.setState({
        threads: [{ pubkey: 'pk1', displayName: 'Alice', unreadCount: 0 }],
      });
    });

    it('opens a confirm dialog when the wipe button is clicked', async () => {
      const user = userEvent.setup();
      render(<DMList />);
      await user.click(screen.getByTestId('wipe-dm-cache'));
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText(/Clear DM cache/i)).toBeInTheDocument();
    });

    it('on confirm, calls clearAccount with the active pubkey and clears store state', async () => {
      const user = userEvent.setup();
      render(<DMList />);
      await user.click(screen.getByTestId('wipe-dm-cache'));
      await user.click(screen.getByRole('button', { name: 'Clear' }));
      expect(clearAccountMock).toHaveBeenCalledWith('a'.repeat(64));
      expect(useDMStore.getState().threads).toEqual([]);
    });

    it('on cancel, does not call clearAccount', async () => {
      const user = userEvent.setup();
      render(<DMList />);
      await user.click(screen.getByTestId('wipe-dm-cache'));
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(clearAccountMock).not.toHaveBeenCalled();
      expect(useDMStore.getState().threads.length).toBe(1);
    });

    it('disables the wipe button when no profile pubkey is available', () => {
      useAuthStore.setState({ profile: null });
      render(<DMList />);
      expect(screen.getByTestId('wipe-dm-cache')).toBeDisabled();
    });
  });
});
