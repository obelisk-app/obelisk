import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/hooks/chat/forum/useNewThreadForm', () => ({
  MAX_THREAD_TAGS: 3,
  useNewThreadForm: () => ({
    title: 'Hello', body: '', selectedTagIds: [], submitting: false, error: null, canSubmit: true,
    setTitle: vi.fn(), setBody: vi.fn(), toggleTag: vi.fn(), submit: vi.fn(),
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
});
