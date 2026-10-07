import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import type { ComposerHandle } from '@/hooks/chat/composer/useChannelComposer';
import { ChannelComposer } from '@/app/[locale]/app/mobile/screens/channel/ChannelComposer';
import { group, message } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

vi.mock('@/hooks/relay/useBotCommands', () => ({ useBotCommands: () => [] }));

const ALICE = 'a'.repeat(64);
const GROUP = group({ id: 'g', name: 'general' });

function mount(props: Partial<React.ComponentProps<typeof ChannelComposer>> = {}) {
  const ref = createRef<ComposerHandle>();
  const setReplyingTo = vi.fn();
  renderWithBridge(
    <ChannelComposer ref={ref} groupId="g" group={GROUP} messages={[]} replyingTo={null} setReplyingTo={setReplyingTo} onOpenNewGame={vi.fn()} {...props} />,
    fakeBridge({
      groups: [GROUP],
      membersByGroup: { g: [ALICE] },
      userMetadata: { [ALICE]: { name: 'alice', displayName: 'Alice' } as never },
    }),
  );
  return { ref, setReplyingTo };
}

describe('ChannelComposer (mobile) reply and handle', () => {
  it('previews the message being replied to, its author and its first 80 characters', () => {
    const long = 'x'.repeat(100);
    mount({ replyingTo: message({ id: 'p', pubkey: ALICE, content: long }) });
    const preview = screen.getByTestId('mobile-reply-preview');
    expect(preview).toHaveTextContent('Alice');
    expect(preview.querySelector('.composer-reply-text')?.textContent).toBe('x'.repeat(80));
  });

  it('cancels the reply from its close button', () => {
    const { setReplyingTo } = mount({ replyingTo: message({ id: 'p', pubkey: ALICE }) });
    fireEvent.click(screen.getByLabelText('Cancel reply'));
    expect(setReplyingTo).toHaveBeenCalledWith(null);
  });

  it('gives the screen a handle to drop files into the composer', () => {
    const { ref } = mount();
    expect(typeof ref.current?.pickFiles).toBe('function');
  });

  it('offers mentions from the caret position as the person types', () => {
    mount();
    const input = screen.getByRole('textbox', { name: 'Message #general' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hi @al', selectionStart: 6 } });
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('re-reads the caret on a selection change', () => {
    mount();
    const input = screen.getByRole('textbox', { name: 'Message #general' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '@al and more' } });
    input.setSelectionRange(3, 3);
    fireEvent.select(input);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    input.setSelectionRange(12, 12);
    fireEvent.select(input);
    expect(screen.queryByText('Alice')).toBeNull();
  });
});
