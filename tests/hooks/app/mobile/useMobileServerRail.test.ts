import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMobileServerRail } from '@/hooks/app/mobile/useMobileServerRail';

describe('useMobileServerRail', () => {
  it('marks the active relay in canonical form', () => {
    const { result } = renderHook(() => useMobileServerRail('wss://relay.one/'));
    expect(result.current.isActive('wss://Relay.One')).toBe(true);
    expect(result.current.isActive('wss://relay.two')).toBe(false);
  });

  it('marks nothing without an active relay', () => {
    const { result } = renderHook(() => useMobileServerRail(null));
    expect(result.current.isActive('wss://relay.one')).toBe(false);
  });
});
