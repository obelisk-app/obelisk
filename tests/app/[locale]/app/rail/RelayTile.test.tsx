import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock();
});

vi.mock('@/services/relay/relay-info', () => ({
  faviconFor: () => null,
  fetchRelayInfo: () => new Promise(() => {}),
}));

import { RelayTile } from '@/app/[locale]/app/rail/RelayTile';

const URL_ = 'wss://relay.example.com';
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mount(props: Partial<{ onClick: () => void; onRemove: () => void }> = {}) {
  const onClick = props.onClick ?? vi.fn();
  const onRemove = props.onRemove ?? vi.fn();
  render(
    <LocaleProvider initialLocale="en">
      <RelayTile url={URL_} active={false} onClick={onClick} onRemove={onRemove} />
    </LocaleProvider>,
  );
  fireEvent.contextMenu(screen.getByRole('button', { name: URL_ }));
  return { onClick, onRemove };
}

describe('desktop RelayTile menu', () => {
  it('opens on right-click with the shared menu rows', () => {
    mount();
    expect(screen.getByRole('menu', { name: URL_ })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Switch to relay',
      'Copy share link',
      'Remove',
    ]);
  });

  it('switch closes the menu and calls through', () => {
    const { onClick } = mount();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch to relay' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('remove closes the menu and calls through', () => {
    const { onRemove } = mount();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('copies the share link and says so for the shared 2000 ms', async () => {
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Copy share link' })); });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('/r/');
    expect(screen.getByRole('menuitem', { name: 'Copied!' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByRole('menuitem', { name: 'Copy share link' })).toBeInTheDocument();
  });

  it('falls back to a prompt when the clipboard refuses', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    mount();
    await act(async () => { fireEvent.click(screen.getByRole('menuitem', { name: 'Copy share link' })); });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0][1]).toContain('/r/');
    expect(screen.getByRole('menuitem', { name: 'Copy share link' })).toBeInTheDocument();
  });
});
