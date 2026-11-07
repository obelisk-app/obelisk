import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useRelayDeckPicker } from '@/hooks/relay/rail/useRelayDeckPicker';

it('closes the picker and switches only after selecting a card', () => {
  const select = vi.fn();
  const { result } = renderHook(() => useRelayDeckPicker(select));
  act(() => result.current.show());
  expect(result.current.open).toBe(true);
  expect(select).not.toHaveBeenCalled();
  act(() => result.current.select('wss://relay.test'));
  expect(result.current.open).toBe(false);
  expect(select).toHaveBeenCalledWith('wss://relay.test');
});
