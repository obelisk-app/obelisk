import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useCurrentRelayUrl: () => 'wss://relay.example.com' });
});

import { CopyInviteLinkButton } from '@/app/app/panes/channel/CopyInviteLinkButton';

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function mount() {
  render(<LocaleProvider initialLocale="en"><CopyInviteLinkButton groupId="g1" /></LocaleProvider>);
}

describe('CopyInviteLinkButton', () => {
  it('copies the channel link with only the channel and the relay host', async () => {
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    const url = new URL(writeText.mock.calls[0][0]);
    expect(url.searchParams.get('c')).toBe('g1');
    expect(url.searchParams.get('relay')).toBe('relay.example.com');
    expect([...url.searchParams.keys()].sort()).toEqual(['c', 'relay']);
  });

  it('confirms for the shared 2000 ms, then returns to the copy label', async () => {
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' })); });
    const copied = screen.getByRole('status');
    expect(copied.textContent).not.toBe('');
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.getByRole('status').textContent).not.toBe('');
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole('button', { name: 'Copy invite link' })).toBeInTheDocument();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('does not claim success when the clipboard refuses', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' })); });
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
