import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DMChat from './DMChat';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';

vi.mock('@/lib/dm', () => ({
  sendDM: vi.fn().mockResolvedValue({ id: 'sent-1', created_at: 1700000000 }),
  fetchDMHistory: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
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

  it('optimistically inserts a pending message, then replaces it on publish', async () => {
    const { sendDM } = await import('@/lib/dm');
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: false, messages: [] });
    const user = userEvent.setup();
    render(<DMChat profileCache={profileCache} />);

    const input = screen.getByTestId('dm-input');
    await user.type(input, 'Hello world');
    await user.keyboard('{Enter}');

    // sendDM was called with protocol + myPubkey
    expect(sendDM).toHaveBeenCalledWith('sender-pk', 'Hello world', 'nip17', 'my-pubkey');

    // After resolve the store contains exactly one message with the real id
    await waitFor(() => {
      const msgs = useDMStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe('sent-1');
      expect(msgs[0].isPending).toBeUndefined();
    });
  });

  it('marks optimistic message as failed and shows retry button on publish error', async () => {
    const { sendDM } = await import('@/lib/dm');
    (sendDM as unknown as { mockRejectedValueOnce: (v: unknown) => void }).mockRejectedValueOnce(new Error('no relay'));
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: false, messages: [] });
    const user = userEvent.setup();
    render(<DMChat profileCache={profileCache} />);

    const input = screen.getByTestId('dm-input');
    await user.type(input, 'broken');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('dm-retry')).toBeInTheDocument();
    });
    const msgs = useDMStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].sendError).toBe('no relay');
  });

  it('shows empty message hint', () => {
    useDMStore.setState({ activeDMPubkey: 'sender-pk', isLoadingMessages: false, messages: [] });
    render(<DMChat profileCache={profileCache} />);
    expect(screen.getByText('No messages yet. Say hello!')).toBeInTheDocument();
  });

  it('opens protocol prompt on send when thread has NIP-04 and no override', async () => {
    const { detectNip04InRecent } = await import('@/lib/dm');
    (detectNip04InRecent as unknown as { mockReturnValueOnce: (v: boolean) => void }).mockReturnValueOnce(true);
    useDMStore.setState({
      activeDMPubkey: 'sender-pk',
      isLoadingMessages: false,
      messages: [
        { id: '1', senderPubkey: 'sender-pk', recipientPubkey: 'my-pubkey', content: 'legacy', createdAt: 1700000000, protocol: 'nip04' },
      ],
    });
    const user = userEvent.setup();
    render(<DMChat profileCache={profileCache} />);

    const input = screen.getByTestId('dm-input');
    await user.type(input, 'reply');
    await user.keyboard('{Enter}');

    // Protocol prompt should be triggered and text restored to input
    expect(useDMStore.getState().showProtocolPrompt).toBe('sender-pk');
    expect((input as HTMLTextAreaElement).value).toBe('reply');
  });
});
