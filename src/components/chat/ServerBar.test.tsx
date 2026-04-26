import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ServerBar from './ServerBar';
import { useChatStore } from '@/store/chat';
import { useAuthStore } from '@/store/auth';

const OWNER_PUBKEY = 'owner-pubkey-123';

describe('ServerBar', () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
    useAuthStore.setState({ user: { pubkey: OWNER_PUBKEY } as any, isConnected: true });
    global.fetch = vi.fn();
  });

  it('renders server icons', () => {
    useChatStore.setState({
      servers: [
        { id: 's1', name: 'La Crypta', icon: null, banner: null, ownerPubkey: OWNER_PUBKEY },
        { id: 's2', name: 'Bitcoin', icon: null, banner: null, ownerPubkey: 'other' },
      ],
      activeServerId: 's1',
    });

    render(<ServerBar />);
    expect(screen.getByText('LA')).toBeInTheDocument();
    expect(screen.getByText('BI')).toBeInTheDocument();
  });

  it('active server has indicator styling', () => {
    useChatStore.setState({
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null, ownerPubkey: OWNER_PUBKEY }],
      activeServerId: 's1',
    });

    render(<ServerBar />);
    const serverBtn = screen.getByTitle('Test');
    expect(serverBtn.className).toContain('bg-lc-green/20');
  });

  it('clicking server calls setActiveServer', async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      servers: [
        { id: 's1', name: 'Server1', icon: null, banner: null, ownerPubkey: OWNER_PUBKEY },
        { id: 's2', name: 'Server2', icon: null, banner: null, ownerPubkey: 'other' },
      ],
      activeServerId: 's1',
    });

    render(<ServerBar />);
    await user.click(screen.getByTitle('Server2'));
    expect(useChatStore.getState().activeServerId).toBe('s2');
  });

  it('Add Server button opens create/join modal', async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null, ownerPubkey: OWNER_PUBKEY }],
      activeServerId: 's1',
    });

    render(<ServerBar />);
    await user.click(screen.getByTitle('Add a Server'));

    expect(screen.getByText('Create a Server')).toBeInTheDocument();
    expect(screen.getByTestId('server-name-input')).toBeInTheDocument();
  });

  it('hides Add Server button for non-owners', () => {
    useAuthStore.setState({ user: { pubkey: 'non-owner' } as any, isConnected: true });
    useChatStore.setState({
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null, ownerPubkey: OWNER_PUBKEY }],
      activeServerId: 's1',
    });

    render(<ServerBar />);
    expect(screen.queryByTitle('Add a Server')).not.toBeInTheDocument();
  });

  it('DMs button is rendered when the DM feature flag is on', () => {
    useChatStore.setState({
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null, ownerPubkey: OWNER_PUBKEY }],
      activeServerId: 's1',
    });

    render(<ServerBar />);
    expect(screen.getByTitle('Direct Messages')).toBeInTheDocument();
  });

  it('create modal dismissible by Cancel button', async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null, ownerPubkey: OWNER_PUBKEY }],
      activeServerId: 's1',
    });

    render(<ServerBar />);
    await user.click(screen.getByTitle('Add a Server'));
    expect(screen.getByText('Create a Server')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText('Create a Server')).not.toBeInTheDocument();
    });
  });
});
