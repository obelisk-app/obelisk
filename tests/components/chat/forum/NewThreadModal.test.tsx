import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import type { JsForumTag } from '@/services/nostr-bridge';
import { NewThreadModal } from '@/components/chat/forum/NewThreadModal';

function mount(forumTags: JsForumTag[] = [], methods: Record<string, unknown> = {}, onClose = vi.fn(), onCreated = vi.fn()) {
  renderWithBridge(
    <NewThreadModal
      forumGroupId="f"
      forumTags={forumTags}
      initialTitle="Hello"
      isPublic
      isHidden={false}
      isRestricted={false}
      isOpen
      onClose={onClose}
      onCreated={onCreated}
    />,
    fakeBridge({}, methods as never),
  );
  return { onClose, onCreated };
}

describe('NewThreadModal fields', () => {
  it('names the title and first-message fields for screen readers', () => {
    mount();
    expect(screen.getByRole('textbox', { name: 'Title' })).toBe(screen.getByTestId('new-thread-title'));
    expect(screen.getByRole('textbox', { name: 'First message' })).toBe(screen.getByTestId('new-thread-body'));
    expect(screen.getByTestId('new-thread-title')).toHaveValue('Hello');
    expect(screen.getByTestId('new-thread-body')).toHaveClass('resize-y');
  });

  it('tag chips show which are picked, and lock the rest at the maximum', () => {
    const tags = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id, emoji: id === 'a' ? '🔥' : null, color: null }));
    mount(tags);
    for (const id of ['a', 'b', 'c', 'd', 'e']) fireEvent.click(screen.getByTestId(`new-thread-tag-${id}`));
    expect(screen.getByTestId('new-thread-tag-a')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('new-thread-tag-a')).toBeEnabled();
    expect(screen.getByTestId('new-thread-tag-a').textContent).toBe('🔥a');
    expect(screen.getByTestId('new-thread-tag-f')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('new-thread-tag-f')).toBeDisabled();
    expect(screen.getByText('Tags (5/5)', { exact: false })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('new-thread-tag-b'));
    expect(screen.getByTestId('new-thread-tag-f')).toBeEnabled();
  });
});

describe('NewThreadModal chrome and submit', () => {
  it('wears the shared modal header and footer; Cancel closes', () => {
    const { onClose } = mount();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Create disabled until there is a body, then publishes and hands the id on', async () => {
    const createGroup = vi.fn().mockResolvedValue('child');
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const { onCreated } = mount([], { createGroup, sendMessage });
    const create = screen.getByTestId('new-thread-submit');
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByTestId('new-thread-body'), { target: { value: 'first' } });
    expect(create).toBeEnabled();
    await act(async () => { fireEvent.click(create); });
    expect(createGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Hello', parent: 'f' }));
    expect(sendMessage).toHaveBeenCalledWith('child', 'first', null, []);
    expect(onCreated).toHaveBeenCalledWith('child');
  });

  it('shows the error when the relay refuses', async () => {
    mount([], { createGroup: vi.fn().mockRejectedValue(new Error('no')) });
    fireEvent.change(screen.getByTestId('new-thread-body'), { target: { value: 'first' } });
    await act(async () => { fireEvent.click(screen.getByTestId('new-thread-submit')); });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not create the publication.');
  });
});
