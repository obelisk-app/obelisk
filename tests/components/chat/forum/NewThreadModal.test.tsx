import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const form = vi.hoisted(() => ({ selectedTagIds: [] as string[], toggleTag: (() => {}) as (id: string) => void }));
vi.mock('@/hooks/chat/forum/useNewThreadForm', () => ({
  MAX_THREAD_TAGS: 3,
  useNewThreadForm: () => ({
    title: 'Hello', body: '', selectedTagIds: form.selectedTagIds, submitting: false, error: null, canSubmit: true,
    setTitle: vi.fn(), setBody: vi.fn(), toggleTag: form.toggleTag, submit: vi.fn(),
  }),
}));

import { NewThreadModal } from '@/components/chat/forum/NewThreadModal';

describe('NewThreadModal fields', () => {
  it('names the title and first-message fields for screen readers', () => {
    render(
      <LocaleProvider initialLocale="en">
        <NewThreadModal
          forumGroupId="f"
          forumTags={[]}
          initialTitle=""
          isPublic
          isHidden={false}
          isRestricted={false}
          isOpen
          onClose={() => {}}
          onCreated={() => {}}
        />
      </LocaleProvider>,
    );
    expect(screen.getByRole('textbox', { name: 'Title' })).toBe(screen.getByTestId('new-thread-title'));
    expect(screen.getByRole('textbox', { name: 'First message' })).toBe(screen.getByTestId('new-thread-body'));
    expect(screen.getByTestId('new-thread-title')).toHaveValue('Hello');
    expect(screen.getByTestId('new-thread-body')).toHaveClass('resize-y');
  });

  it('tag chips show which are picked, and lock the rest at the maximum', () => {
    form.selectedTagIds = ['a', 'b', 'c'];
    const toggled: string[] = [];
    form.toggleTag = (id) => toggled.push(id);
    const tags = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, emoji: id === 'a' ? '🔥' : null, color: null }));
    render(
      <LocaleProvider initialLocale="en">
        <NewThreadModal forumGroupId="f" forumTags={tags} initialTitle="" isPublic isHidden={false} isRestricted={false} isOpen onClose={() => {}} onCreated={() => {}} />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('new-thread-tag-a')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('new-thread-tag-a')).toBeEnabled();
    expect(screen.getByTestId('new-thread-tag-a').textContent).toBe('🔥a');
    expect(screen.getByTestId('new-thread-tag-d')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('new-thread-tag-d')).toBeDisabled();
    fireEvent.click(screen.getByTestId('new-thread-tag-b'));
    expect(toggled).toEqual(['b']);
    expect(screen.getByText('Tags (3/3)', { exact: false })).toBeInTheDocument();
  });
});
