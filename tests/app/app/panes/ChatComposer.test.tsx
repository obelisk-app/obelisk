import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/services/nostr-bridge', async () => (await import('@tests/support/composer-mount')).composerBridgeMock());
vi.mock('@/services/bot-commands', async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, useBotCommands: () => [] };
});

import { ChatComposer } from '@/app/app/panes/ChatComposer';
import { GROUP } from '@tests/support/composer-mount';

function mount() {
  render(
    <LocaleProvider initialLocale="en">
      <ChatComposer groupId="g" group={GROUP} messages={[]} replyingTo={null} setReplyingTo={() => {}} onOpenNewGame={() => {}} />
    </LocaleProvider>,
  );
}

describe('ChatComposer', () => {
  it('renders the message input named by its placeholder and swaps the mic for a send button once there is a draft', () => {
    mount();
    const input = screen.getByPlaceholderText('Message #general');
    expect(input.tagName).toBe('INPUT');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('has an accessible name for screen readers', () => {
    mount();
    expect(screen.getByRole('textbox', { name: 'Message #general' })).toBeInTheDocument();
  });
});
