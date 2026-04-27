import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nip19 } from 'nostr-tools';
import NewDMModal from './NewDMModal';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';
import { _profileStore, _resetProfileCache } from '@/lib/dm/profile-cache';

// Mock the coalescer so `useProfile`'s lazy `getProfile` call doesn't try
// to talk to real relays. We only need to assert it was invoked with the
// expected (me, partner) — the preview UI is driven by writing directly
// into the real `_profileStore`, which is what the hook subscribes to.
const enqueueMock = vi.fn();
vi.mock('@/lib/nostr-coalescer', () => ({
  sharedCoalescer: {
    enqueue: (req: any) => { enqueueMock(req); return () => {}; },
    querySync: vi.fn(),
  },
}));

const profileCache = new Map<string, { name?: string; picture?: string }>();
profileCache.set('abc123'.padEnd(64, '0'), { name: 'Alice' });

describe('NewDMModal', () => {
  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
  });

  it('renders input and buttons', () => {
    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    expect(screen.getByTestId('new-dm-pubkey-input')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByTestId('start-dm-btn')).toBeInTheDocument();
  });

  it('start button is disabled when input empty', () => {
    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    expect(screen.getByTestId('start-dm-btn')).toBeDisabled();
  });

  it('starts chat with valid hex pubkey', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const hexPk = 'a'.repeat(64);

    render(<NewDMModal onClose={onClose} profileCache={profileCache} />);
    await user.type(screen.getByTestId('new-dm-pubkey-input'), hexPk);
    await user.click(screen.getByTestId('start-dm-btn'));

    expect(useDMStore.getState().activeDMPubkey).toBe(hexPk);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows error on invalid input', async () => {
    const user = userEvent.setup();
    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    await user.type(screen.getByTestId('new-dm-pubkey-input'), 'invalid-key');
    await user.click(screen.getByTestId('start-dm-btn'));

    expect(screen.getByTestId('new-dm-error')).toBeInTheDocument();
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
  });

  it('closes on Cancel click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<NewDMModal onClose={onClose} profileCache={profileCache} />);
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<NewDMModal onClose={onClose} profileCache={profileCache} />);
    // Click the backdrop (outermost fixed div)
    const backdrop = container.firstElementChild as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('NewDMModal profile preview', () => {
  const partnerHex = 'b'.repeat(64);
  const validNpub = nip19.npubEncode(partnerHex);
  const myPubkey = 'c'.repeat(64);

  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
    _resetProfileCache();
    enqueueMock.mockClear();
    localStorage.clear();
    // Provide a "me" pubkey so the modal knows whose cache to read.
    useAuthStore.setState({
      ...useAuthStore.getState(),
      profile: { pubkey: myPubkey, name: 'Me', displayName: 'Me' } as unknown as never,
    });
  });

  it('previews resolved profile after valid npub paste, via useProfile', async () => {
    // Pre-seed the keyed observable so the hook's first render shows the
    // entry without waiting for a relay round-trip.
    _profileStore().set(`${myPubkey}|${partnerHex}`, {
      event: {} as never,
      parsed: { displayName: 'alice', picture: 'https://example.com/a.png' },
      lastCheckedAt: Date.now(),
    });

    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    const input = screen.getByTestId('new-dm-pubkey-input');
    fireEvent.change(input, { target: { value: validNpub } });

    expect(await screen.findByText(/alice/i)).toBeInTheDocument();
    // Pre-seeding above makes the slot fresh, so the hook correctly skips
    // the coalescer fetch. The fetch path is exercised in
    // nostr-hooks.test.tsx; here we only care that the UI renders the slot.
  });

  it('re-renders preview when a newer profile lands in the store (live SWR)', async () => {
    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    const input = screen.getByTestId('new-dm-pubkey-input');
    fireEvent.change(input, { target: { value: validNpub } });

    // Initially no preview content (slot empty); component still renders the
    // preview row keyed off the resolved partner hex.
    expect(screen.getByTestId('new-dm-preview')).toBeInTheDocument();

    // Simulate the relay arrival.
    act(() => {
      _profileStore().set(`${myPubkey}|${partnerHex}`, {
        event: {} as never,
        parsed: { displayName: 'alice-from-relay' },
        lastCheckedAt: Date.now(),
      });
    });

    expect(await screen.findByText(/alice-from-relay/i)).toBeInTheDocument();
  });

  it('drops the preview when the input is cleared', async () => {
    _profileStore().set(`${myPubkey}|${partnerHex}`, {
      event: {} as never,
      parsed: { displayName: 'alice' },
      lastCheckedAt: Date.now(),
    });

    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    const input = screen.getByTestId('new-dm-pubkey-input');
    fireEvent.change(input, { target: { value: validNpub } });
    await screen.findByText(/alice/i);

    fireEvent.change(input, { target: { value: '' } });
    // The preview block is keyed off `partnerHex`; clearing the input
    // makes it null, so the row disappears.
    expect(screen.queryByTestId('new-dm-preview')).not.toBeInTheDocument();
  });
});
