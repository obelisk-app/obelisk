import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/relay-info', () => ({
  faviconFor: (url: string) => `https://favicon/${url}`,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/relay-branding', () => ({
  useRelayBranding: () => ({}),
}));

import { RelayTile } from './PhoneShell';

describe('RelayTile long-press', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('fires onLongPress after 500ms and suppresses the click', () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    render(
      <RelayTile
        url="wss://relay.example"
        active={false}
        onClick={onClick}
        onLongPress={onLongPress}
      />,
    );

    const tile = screen.getByRole('button');
    fireEvent.touchStart(tile);
    vi.advanceTimersByTime(600);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'wss://relay.example' }),
    );

    fireEvent.touchEnd(tile);
    fireEvent.click(tile);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire onLongPress on a quick tap', () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    render(
      <RelayTile
        url="wss://relay.example"
        active={false}
        onClick={onClick}
        onLongPress={onLongPress}
      />,
    );

    const tile = screen.getByRole('button');
    fireEvent.touchStart(tile);
    vi.advanceTimersByTime(120);
    fireEvent.touchEnd(tile);
    expect(onLongPress).not.toHaveBeenCalled();

    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('cancels the timer when the touch moves (e.g. horizontal scroll drag)', () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    render(
      <RelayTile
        url="wss://relay.example"
        active={false}
        onClick={onClick}
        onLongPress={onLongPress}
      />,
    );

    const tile = screen.getByRole('button');
    fireEvent.touchStart(tile);
    vi.advanceTimersByTime(200);
    fireEvent.touchMove(tile);
    vi.advanceTimersByTime(600);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('fires onLongPress on right-click and suppresses the native menu', () => {
    const onLongPress = vi.fn();
    render(
      <RelayTile
        url="wss://relay.example"
        active={false}
        onClick={() => {}}
        onLongPress={onLongPress}
      />,
    );

    const tile = screen.getByRole('button');
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    tile.dispatchEvent(evt);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
  });
});
