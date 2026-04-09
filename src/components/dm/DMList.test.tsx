import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DMList from './DMList';
import { useDMStore } from '@/store/dm';

describe('DMList', () => {
  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
  });

  it('shows empty state', () => {
    render(<DMList onNewDM={vi.fn()} />);
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('renders threads', () => {
    useDMStore.setState({
      threads: [
        { pubkey: 'pk1', displayName: 'Alice', unreadCount: 0 },
        { pubkey: 'pk2', displayName: 'Bob', lastMessage: 'Hey!', unreadCount: 3 },
      ],
    });

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
