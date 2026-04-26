import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nip19 } from 'nostr-tools';
import NewDMModal from './NewDMModal';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';

const getProfileMock = vi.fn();
vi.mock('@/lib/dm/profile-cache', () => ({
  getProfile: (...args: unknown[]) => getProfileMock(...args),
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
    getProfileMock.mockReset();
    // Provide a "me" pubkey so the modal knows whose cache to read.
    useAuthStore.setState({
      ...useAuthStore.getState(),
      profile: { pubkey: myPubkey, name: 'Me', displayName: 'Me' } as unknown as never,
    });
  });

  it('previews resolved profile after valid npub paste, via getProfile', async () => {
    getProfileMock.mockReturnValue({
      profile: {
        event: {} as unknown,
        parsed: { displayName: 'alice', picture: 'https://example.com/a.png' },
        lastCheckedAt: Date.now(),
      },
      dispose: vi.fn(),
    });

    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    const input = screen.getByTestId('new-dm-pubkey-input');
    fireEvent.change(input, { target: { value: validNpub } });

    expect(await screen.findByText(/alice/i)).toBeInTheDocument();
    expect(getProfileMock).toHaveBeenCalled();
    const [calledMe, calledPartner] = getProfileMock.mock.calls[0];
    expect(calledMe).toBe(myPubkey);
    expect(calledPartner).toBe(partnerHex);
  });

  it('updates preview when getProfile fires onUpdate (live SWR refresh)', async () => {
    let captured: ((p: unknown) => void) | undefined;
    getProfileMock.mockImplementation((_me, _partner, opts: { onUpdate?: (p: unknown) => void }) => {
      captured = opts?.onUpdate;
      return { profile: null, dispose: vi.fn() };
    });

    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    const input = screen.getByTestId('new-dm-pubkey-input');
    fireEvent.change(input, { target: { value: validNpub } });

    // First sync result: cache miss — no name yet.
    expect(captured).toBeDefined();
    captured!({
      event: {},
      parsed: { displayName: 'alice-from-relay' },
      lastCheckedAt: Date.now(),
    });

    expect(await screen.findByText(/alice-from-relay/i)).toBeInTheDocument();
  });

  it('disposes the profile subscription when the input changes', async () => {
    const dispose = vi.fn();
    getProfileMock.mockReturnValue({
      profile: { event: {} as unknown, parsed: { displayName: 'alice' }, lastCheckedAt: Date.now() },
      dispose,
    });

    render(<NewDMModal onClose={vi.fn()} profileCache={profileCache} />);
    const input = screen.getByTestId('new-dm-pubkey-input');
    fireEvent.change(input, { target: { value: validNpub } });
    await screen.findByText(/alice/i);

    // Clearing the input should drop the subscription.
    fireEvent.change(input, { target: { value: '' } });
    expect(dispose).toHaveBeenCalled();
  });
});
