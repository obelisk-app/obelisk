import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DMList from './DMList';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';

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
  });

  it('shows empty state', () => {
    render(<DMList onNewDM={vi.fn()} />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('shows loading skeleton while isLoadingThreads and no threads cached', () => {
    useDMStore.setState({ isLoadingThreads: true, threads: [] });
    const { container } = render(<DMList onNewDM={vi.fn()} />);
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

    render(<DMList onNewDM={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Hey!')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onNewDM when clicking new DM button', async () => {
    const onNewDM = vi.fn();
    const user = userEvent.setup();
    render(<DMList onNewDM={onNewDM} />);
    await user.click(screen.getByTestId('new-dm-btn'));
    expect(onNewDM).toHaveBeenCalled();
  });

  it('does not render a refresh button (polling handles refresh)', () => {
    render(<DMList onNewDM={vi.fn()} />);
    expect(screen.queryByTestId('dm-refresh-btn')).not.toBeInTheDocument();
  });

  it('selects a thread', async () => {
    useDMStore.setState({
      threads: [{ pubkey: 'pk1', displayName: 'Alice', unreadCount: 0 }],
    });

    const user = userEvent.setup();
    render(<DMList onNewDM={vi.fn()} />);
    await user.click(screen.getByText('Alice'));
    expect(useDMStore.getState().activeDMPubkey).toBe('pk1');
  });
});
