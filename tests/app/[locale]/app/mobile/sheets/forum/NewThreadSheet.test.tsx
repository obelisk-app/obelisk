vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock({
    useSignerReady: () => true,
  });
});
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({  });
});

vi.mock('@/app/[locale]/app/mobile/screens/forum/MobileTagDot', () => ({
  MobileTagDot: () => <span data-testid="tag-dot" />,
}));

import { NewThreadSheet } from '@/app/[locale]/app/mobile/sheets/forum/NewThreadSheet';

function mount(close = vi.fn()) {
  render(
    <LocaleProvider initialLocale="en">
      <NewThreadSheet
        forumGroupId="rly/forum"
        forumTags={[{ id: 'news', name: 'News', emoji: null, color: null }]}
        initialTitle="Hello"
        isPublic
        isHidden={false}
        isRestricted={false}
        isOpen
        close={close}
        onCreated={() => {}}
      />
    </LocaleProvider>,
  );
  return { close };
}

describe('NewThreadSheet', () => {
  it('renders the new-thread sheet as a form seeded with the initial title', () => {
    mount();
    const host = screen.getByTestId('mobile-new-thread-sheet');
    expect(host).toHaveClass('sheet-host');
    expect(host).toHaveAttribute('data-screen', 'new-thread');
    expect(host.querySelector('.sheet form')).not.toBeNull();
    expect(screen.getByText('New publication')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-new-thread-title')).toHaveValue('Hello');
    expect(screen.getByTestId('mobile-new-thread-tag-picker')).toBeInTheDocument();
  });

  it('closes on a backdrop tap and on Cancel', () => {
    const { close } = mount();
    fireEvent.click(screen.getByTestId('mobile-new-thread-sheet').querySelector('.sheet-backdrop')!);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('ends on the shared sheet actions, whose Create submits the form and waits for a body', () => {
    mount();
    const create = screen.getByTestId('mobile-new-thread-submit');
    expect(create).toHaveClass('btn-primary');
    expect(create).toHaveAttribute('type', 'submit');
    expect(create).toHaveAttribute('form', screen.getByTestId('mobile-new-thread-sheet').querySelector('form')!.id);
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByTestId('mobile-new-thread-body'), { target: { value: 'hi' } });
    expect(create).toBeEnabled();
  });
});

describe('NewThreadSheet accessibility', () => {
  it('names the title and first-message fields by their visible labels', () => {
    mount();
    expect(screen.getByLabelText('Title')).toBe(screen.getByTestId('mobile-new-thread-title'));
    expect(screen.getByLabelText('First message')).toBe(screen.getByTestId('mobile-new-thread-body'));
    expect(screen.getByTestId('mobile-new-thread-title')).toHaveClass('setup-input');
    expect(screen.getByTestId('mobile-new-thread-body')).toHaveClass('setup-textarea');
  });
});
