import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => (await import('@tests/support/composer-mount')).composerBridgeMock());
vi.mock('@/hooks/relay/operator/useBotCommands', () => ({ useBotCommands: () => [] }));

import { ChatComposer } from '@/app/[locale]/app/panes/channel/ChatComposer';
import { COMPOSER_ALICE, GROUP, sendMessage } from '@tests/support/composer-mount';
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
    expect(input.tagName).toBe('TEXTAREA');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('Ctrl+Enter breaks the line; Enter sends the multi-line draft', async () => {
    sendMessage.mockClear();
    sendMessage.mockResolvedValue(undefined);
    mount();
    const input = screen.getByPlaceholderText('Message #general') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'one', selectionStart: 3, selectionEnd: 3 } });
    input.setSelectionRange(3, 3);
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(input.value).toBe('one\n');
    expect(sendMessage).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'one\ntwo' } });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); await Promise.resolve(); });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][1]).toBe('one\ntwo');
  });

  it('has an accessible name for screen readers', () => {
    mount();
    expect(screen.getByRole('textbox', { name: 'Message #general' })).toBeInTheDocument();
  });

  it('names the picker button and gives it and the input test ids', () => {
    mount();
    const button = screen.getByTestId('composer-picker-button');
    expect(button).toHaveAccessibleName('Emoji, GIFs and stickers');
    expect(button).toHaveAttribute('title', 'Emoji, GIFs and stickers');
    expect(screen.getByTestId('composer-input').tagName).toBe('TEXTAREA');
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
    const button = screen.getByRole('button', { name: 'Emoji, GIFs and stickers' });
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
    const button = screen.getByRole('button', { name: 'Emoji, GIFs and stickers' });
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
