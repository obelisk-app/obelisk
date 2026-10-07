import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePqShield } from '@/hooks/chat/pq/usePqShield';

const blur = (inside: boolean) => {
  const parent = document.createElement('span');
  const button = document.createElement('button');
  const link = document.createElement('a');
  parent.append(button, link);
  return { currentTarget: button, relatedTarget: inside ? link : document.body } as unknown as React.FocusEvent<HTMLElement>;
};

describe('usePqShield', () => {
  it('shows, hides and toggles', () => {
    const { result } = renderHook(() => usePqShield());
    act(() => result.current.show());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
    expect(result.current.panelId).toBeTruthy();
  });

  it('a blur into the panel keeps it open; one elsewhere closes it', () => {
    const { result } = renderHook(() => usePqShield());
    act(() => result.current.show());
    act(() => result.current.onBlur(blur(true)));
    expect(result.current.open).toBe(true);
    act(() => result.current.onBlur(blur(false)));
    expect(result.current.open).toBe(false);
  });
});
