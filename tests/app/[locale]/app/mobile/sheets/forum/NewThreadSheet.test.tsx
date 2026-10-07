import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useSignerReady: () => true });
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
    expect(host.querySelector('form.sheet')).not.toBeNull();
    expect(screen.getByText('New publication')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-new-thread-title')).toHaveValue('Hello');
    expect(screen.getByTestId('mobile-new-thread-tag-picker')).toBeInTheDocument();
  });

  it('closes on a backdrop tap', () => {
    const { close } = mount();
    fireEvent.click(screen.getByTestId('mobile-new-thread-sheet').querySelector('.sheet-backdrop')!);
    expect(close).toHaveBeenCalledTimes(1);
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
