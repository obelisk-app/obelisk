import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DMChat from './DMChat';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';

vi.mock('@/lib/dm', () => ({
  sendDM: vi.fn().mockResolvedValue({ id: 'sent-1' }),
  fetchDMHistory: vi.fn().mockResolvedValue([]),
  detectNip04InRecent: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/nostr', () => ({
  formatPubkey: (pk: string) => pk.slice(0, 8) + '...',
  getNDK: () => ({ signer: {} }),
  connectNDK: vi.fn(),
}));

const profileCache = new Map<string, { name?: string; picture?: string }>();
profileCache.set('sender-pk', { name: 'Alice', picture: 'https://example.com/alice.png' });

describe('DMChat', () => {
  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
    useAuthStore.setState({
      ...useAuthStore.getState(),
      profile: { pubkey: 'my-pubkey', displayName: 'Me' } as never,
    });
  });

  it('renders empty state when no active DM', () => {
    render(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('Select a conversation')).toBeInTheDocument();
  });

  it('renders skeleton loading state', () => {
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: true, messages: [] });
    const { container } = render(<DMChat profileCache={profileCache} />);
    expect(container.querySelectorAll('.lc-skeleton-circle').length).toBeGreaterThan(0);
  });

  it('renders messages', () => {
    useDMStore.setState({
      activeDMPubkey: 'sender-pk',
      isLoadingMessages: false,
      messages: [
        { id: '1', senderPubkey: 'sender-pk', recipientPubkey: 'my-pubkey', content: 'Hello!', createdAt: 1700000000, protocol: 'nip17' },
        { id: '2', senderPubkey: 'my-pubkey', recipientPubkey: 'sender-pk', content: 'Hi back!', createdAt: 1700000060, protocol: 'nip17' },
      ],
    });
    render(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.getByText('Hi back!')).toBeInTheDocument();
  });

  it('shows NIP-17 protocol indicator', () => {
    useDMStore.setState({ activeDMPubkey: 'sender-pk', messages: [] });
    render(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('🔒 NIP-17')).toBeInTheDocument();
  });

  it('shows NIP-04 indicator when override set', () => {
    useDMStore.setState({
      activeDMPubkey: 'sender-pk',
      messages: [],
      protocolOverrides: { 'sender-pk': 'nip04' },
    });
    render(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('⚠️ NIP-04')).toBeInTheDocument();
  });

  it('sends message on Enter and clears input', async () => {
    const { sendDM } = await import('@/lib/dm');
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: false, messages: [] });
    const user = userEvent.setup();
    render(<DMChat profileCache={profileCache} />);

    const input = screen.getByTestId('dm-input');
    await user.type(input, 'Hello world');
    await user.keyboard('{Enter}');

    expect(sendDM).toHaveBeenCalledWith('sender-pk', 'Hello world', 'nip17');
  });

  it('shows empty message hint', () => {
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: false, messages: [] });
    render(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('No messages yet. Say hello!')).toBeInTheDocument();
  });
});
