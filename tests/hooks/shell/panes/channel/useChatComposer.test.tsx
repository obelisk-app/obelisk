import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { useChatComposer, type ChatComposerProps } from '@/hooks/shell/panes/channel/useChatComposer';
import type { ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';

vi.mock('@/hooks/relay/useBotCommands', () => ({ useBotCommands: () => [] }));

const GROUP = groupFixture({ id: 'g', name: 'general' });

function setup(over: Partial<ChatComposerProps> = {}) {
  const ref = createRef<ComposerHandle>();
  const props: ChatComposerProps = {
    groupId: 'g', group: GROUP, messages: [], replyingTo: null, setReplyingTo: vi.fn(), onOpenNewGame: vi.fn(), ...over,
  };
  const view = renderHook(() => useChatComposer(props, ref), { wrapper: bridgeWrapper(fakeBridge({ groups: [GROUP] })) });
  return { ...view, ref };
}

const change = (value: string) => ({ target: { value, selectionStart: value.length } }) as never;

describe('useChatComposer', () => {
  it('names the channel, or the start of its id', () => {
    expect(setup().result.current.channelName).toBe('general');
    expect(setup({ groupId: 'abcdefghijkl', group: null }).result.current.channelName).toBe('abcdefgh');
  });

  it('exposes pickFiles on the forwarded ref', () => {
    const { ref } = setup();
    expect(typeof ref.current?.pickFiles).toBe('function');
  });

  it('typing fills the draft and turns the mic into send; spaces alone do not', () => {
    const { result } = setup();
    expect(result.current.canSend).toBe(false);
    act(() => result.current.onChange(change('   ')));
    expect(result.current.canSend).toBe(false);
    act(() => result.current.onChange(change('hello')));
    expect(result.current.composer.draft).toBe('hello');
    expect(result.current.canSend).toBe(true);
  });

  it('an image link in the draft shows the attachments strip', () => {
    const { result } = setup();
    expect(result.current.showAttachments).toBe(false);
    act(() => result.current.onChange(change('https://x.test/cat.png')));
    expect(result.current.showAttachments).toBe(true);
  });

  it('the picker button toggles the picker, and a press outside closes it', () => {
    const { result } = setup();
    act(() => result.current.toggleEmoji());
    expect(result.current.composer.emojiOpen).toBe(true);
    act(() => result.current.toggleEmoji());
    expect(result.current.composer.emojiOpen).toBe(false);
    act(() => result.current.toggleEmoji());
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.composer.emojiOpen).toBe(false);
  });

  it('a picked emoji goes into the draft and the focus returns to the input', () => {
    const { result } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    (result.current.inputRef as { current: HTMLInputElement | null }).current = input;
    act(() => result.current.toggleEmoji());
    act(() => result.current.pickMedia('😀'));
    expect(result.current.composer.draft).toContain('😀');
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it('a selection change moves the caret', () => {
    const { result } = setup();
    act(() => result.current.onChange(change('hello')));
    act(() => result.current.onSelect({ currentTarget: { value: 'hello', selectionStart: 2 } } as never));
    expect(result.current.composer.caret).toBe(2);
  });
});
