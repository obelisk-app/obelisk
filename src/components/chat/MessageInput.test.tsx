import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import MessageInput from './MessageInput';
import { useChatStore } from '@/store/chat';

describe('MessageInput', () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      ...useChatStore.getInitialState(),
      activeChannelId: 'ch1',
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });
  });

  it('renders nothing when no active channel', () => {
    useChatStore.setState({ activeChannelId: null });
    const { container } = render(<MessageInput onSend={mockOnSend} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders textarea with placeholder', () => {
    render(<MessageInput onSend={mockOnSend} />);
    expect(screen.getByPlaceholderText('Message #general')).toBeInTheDocument();
  });

  it('calls onSend with content and undefined replyToId when pressing Enter', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, 'Hello world{enter}');
    expect(mockOnSend).toHaveBeenCalledWith('Hello world', undefined);
  });

  it('does not send empty messages', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, '   {enter}');
    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it('allows newline with Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, 'line1{shift>}{enter}{/shift}line2');
    expect(mockOnSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('line1\nline2');
  });

  it('clears input after sending', async () => {
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, 'Hello{enter}');
    expect(textarea).toHaveValue('');
  });

  it('shows reply preview when replyingTo is set', () => {
    useChatStore.setState({
      ...useChatStore.getState(),
      replyingTo: {
        id: 'm1', channelId: 'ch1', authorPubkey: 'pk123456', content: 'Original message',
        replyToId: null, editedAt: null, createdAt: new Date().toISOString(),
      },
    });

    render(<MessageInput onSend={mockOnSend} />);
    expect(screen.getByText(/Replying to/)).toBeInTheDocument();
    expect(screen.getByText(/Original message/)).toBeInTheDocument();
  });

  it('includes replyToId when sending with reply', async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      ...useChatStore.getState(),
      replyingTo: {
        id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'test',
        replyToId: null, editedAt: null, createdAt: new Date().toISOString(),
      },
    });

    render(<MessageInput onSend={mockOnSend} />);
    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, 'My reply{enter}');
    expect(mockOnSend).toHaveBeenCalledWith('My reply', 'm1');
  });

  it('calls onTyping when typing', async () => {
    const onTyping = vi.fn();
    const user = userEvent.setup();
    render(<MessageInput onSend={mockOnSend} onTyping={onTyping} />);

    const textarea = screen.getByPlaceholderText('Message #general');
    await user.type(textarea, 'hi');
    expect(onTyping).toHaveBeenCalled();
  });
});
