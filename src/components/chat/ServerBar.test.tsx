import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ServerBar from './ServerBar';
import { useChatStore } from '@/store/chat';

describe('ServerBar', () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
    global.fetch = vi.fn();
  });

  it('renders server icons', () => {
    useChatStore.setState({
      servers: [
        { id: 's1', name: 'La Crypta', icon: null, banner: null },
        { id: 's2', name: 'Bitcoin', icon: null, banner: null },
      ],
      activeServerId: 's1',
    });

    render(<ServerBar />);
    expect(screen.getByText('LA')).toBeInTheDocument();
    expect(screen.getByText('BI')).toBeInTheDocument();
  });

  it('active server has indicator styling', () => {
    useChatStore.setState({
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
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
        { id: 's1', name: 'Server1', icon: null, banner: null },
        { id: 's2', name: 'Server2', icon: null, banner: null },
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
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
    });

    render(<ServerBar />);
    await user.click(screen.getByTitle('Add a Server'));

    expect(screen.getByText('Create a Server')).toBeInTheDocument();
    expect(screen.getByTestId('server-name-input')).toBeInTheDocument();
  });

  it('DMs button toggles DM mode', async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
    });

    const { useDMStore } = await import('@/store/dm');
    useDMStore.setState(useDMStore.getInitialState());

    render(<ServerBar />);
    await user.click(screen.getByTitle('Direct Messages'));
    expect(useDMStore.getState().isDMMode).toBe(true);

    await user.click(screen.getByTitle('Direct Messages'));
    expect(useDMStore.getState().isDMMode).toBe(false);
  });

  it('create modal dismissible by Cancel button', async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
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
