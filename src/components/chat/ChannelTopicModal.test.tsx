import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChannelTopicModal from './ChannelTopicModal';

describe('ChannelTopicModal', () => {
  const defaults = {
    channelName: 'chat-general',
    channelType: 'text',
    channelEmoji: null,
    description: 'Toda gran idea comienza con una conversación casual.',
  };

  it('renders title, channel name, and description', () => {
    render(<ChannelTopicModal {...defaults} onClose={() => {}} />);
    expect(screen.getByText('Tema del canal')).toBeInTheDocument();
    expect(screen.getByText('chat-general')).toBeInTheDocument();
    expect(screen.getByText(defaults.description)).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ChannelTopicModal {...defaults} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(<ChannelTopicModal {...defaults} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('channel-topic-modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<ChannelTopicModal {...defaults} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
