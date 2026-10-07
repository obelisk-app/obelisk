import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type React from 'react';

vi.mock('@/services/relay/relay-info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/relay/relay-info')>()),
  fetchRelayInfo: () => new Promise(() => {}),
}));

import { useRelayTile } from '@/hooks/shell/rail/useRelayTile';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { colorFor, letterFor } from '@/utils/relay-url/relay-tile-style';

function setup() {
  const onClick = vi.fn();
  const onRemove = vi.fn();
  const view = renderHook(() => useRelayTile('wss://relay.example.com', false, { onClick, onRemove }), { wrapper: bridgeWrapper(fakeBridge()) });
  return { ...view, onClick, onRemove };
}

describe('useRelayTile', () => {
  it('letters the tile from the host, on its accent', () => {
    const { result } = setup();
    expect(result.current.initials).toBe(letterFor('relay.example.com'));
    expect(result.current.accent).toBe(colorFor('relay.example.com'));
    expect(result.current.icon).toBeNull();
  });

  it('opens the menu on right-click instead of the browser menu', () => {
    const { result } = setup();
    const preventDefault = vi.fn();
    act(() => result.current.openMenu({ preventDefault } as unknown as React.MouseEvent));
    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.menu).toBe(true);
    act(() => result.current.closeMenu());
    expect(result.current.menu).toBe(false);
  });

  it('switch and remove close the menu, then call through', () => {
    const { result, onClick, onRemove } = setup();
    act(() => result.current.setMenu(true));
    act(() => result.current.switchTo());
    expect(result.current.menu).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
    act(() => result.current.setMenu(true));
    act(() => result.current.remove());
    expect(result.current.menu).toBe(false);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
