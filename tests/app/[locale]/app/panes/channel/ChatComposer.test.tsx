import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => (await import('@tests/support/composer-mount')).composerBridgeMock());
vi.mock('@/hooks/relay/useBotCommands', () => ({ useBotCommands: () => [] }));

import { ChatComposer } from '@/app/[locale]/app/panes/channel/ChatComposer';
import { COMPOSER_ALICE, GROUP } from '@tests/support/composer-mount';
import type { ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import type { JsMessage } from '@/services/nostr-bridge';
import { displayNameFor } from '@/utils/identity/display-name';

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

describe('ChatComposer around the input', () => {
  const reply = { id: 'r1', pubkey: COMPOSER_ALICE, content: 'x'.repeat(100), createdAt: 1, kind: 9, replyToId: null, mentions: [] } as unknown as JsMessage;

  it('shows who is being replied to, with the start of their message, and cancels the reply', () => {
    const setReplyingTo = vi.fn();
    render(
      <LocaleProvider initialLocale="en">
        <ChatComposer groupId="g" group={GROUP} messages={[]} replyingTo={reply} setReplyingTo={setReplyingTo} onOpenNewGame={() => {}} />
      </LocaleProvider>,
    );
    const bar = screen.getByText(/Replying to/);
    expect(bar.querySelector('.font-semibold')?.textContent).toBe(displayNameFor(COMPOSER_ALICE, null));
    expect(screen.getByText('x'.repeat(80))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(setReplyingTo).toHaveBeenCalledWith(null);
  });

  it('names the input after the channel id when the channel has no name', () => {
    render(
      <LocaleProvider initialLocale="en">
        <ChatComposer groupId="abcdefghijkl" group={null} messages={[]} replyingTo={null} setReplyingTo={() => {}} onOpenNewGame={() => {}} />
      </LocaleProvider>,
    );
    expect(screen.getByPlaceholderText('Message #abcdefgh')).toBeInTheDocument();
  });

  it('shows an image link in the draft as an attachment that can be removed', () => {
    mount();
    const input = screen.getByPlaceholderText('Message #general');
    fireEvent.change(input, { target: { value: 'https://x.test/cat.png' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove attachment' }));
    expect(screen.queryByRole('button', { name: 'Remove attachment' })).toBeNull();
    expect(input).toHaveValue('');
  });

  it('the picker button opens and closes the picker, and a click elsewhere closes it', () => {
    mount();
    const button = screen.getByRole('button', { name: 'Open emoji, GIF, and sticker picker' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    fireEvent.mouseDown(document.body);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('a click inside the picker area keeps it open', () => {
    mount();
    const button = screen.getByRole('button', { name: 'Open emoji, GIF, and sticker picker' });
    fireEvent.click(button);
    fireEvent.mouseDown(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('exposes pickFiles to the panel for dropped files', () => {
    const ref = createRef<ComposerHandle>();
    render(
      <LocaleProvider initialLocale="en">
        <ChatComposer ref={ref} groupId="g" group={GROUP} messages={[]} replyingTo={null} setReplyingTo={() => {}} onOpenNewGame={() => {}} />
      </LocaleProvider>,
    );
    expect(typeof ref.current?.pickFiles).toBe('function');
  });
});
