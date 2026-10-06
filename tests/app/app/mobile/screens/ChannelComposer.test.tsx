import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/services/nostr-bridge', async () => (await import('@tests/support/composer-mount')).composerBridgeMock());
vi.mock('@/hooks/relay/useBotCommands', () => ({ useBotCommands: () => [] }));

import { ChannelComposer } from '@/app/app/mobile/screens/ChannelComposer';
import { GROUP } from '@tests/support/composer-mount';

function mount() {
  render(
    <LocaleProvider initialLocale="en">
      <ChannelComposer groupId="g" group={GROUP} messages={[]} replyingTo={null} setReplyingTo={() => {}} onOpenNewGame={() => {}} />
    </LocaleProvider>,
  );
}

describe('ChannelComposer (mobile)', () => {
  it('renders the stylesheet-classed input and shows Send once there is a draft', () => {
    mount();
    const input = screen.getByPlaceholderText('Message #general');
    expect(input).toHaveClass('composer-input');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    fireEvent.change(input, { target: { value: 'hi' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('has an accessible name for screen readers', () => {
    mount();
    expect(screen.getByRole('textbox', { name: 'Message #general' })).toBeInTheDocument();
  });
});
