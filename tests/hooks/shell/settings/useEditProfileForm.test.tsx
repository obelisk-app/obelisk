import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEditProfileForm } from '@/hooks/shell/settings/useEditProfileForm';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const INITIAL = { displayName: 'Ana', name: 'ana', about: 'hi', picture: 'p.png', banner: null, nip05: null, lud16: null, website: null };

describe('useEditProfileForm', () => {
  it('reads the picture and banner as one appearance value and fans changes back out', () => {
    const { result } = renderHook(() => useEditProfileForm(INITIAL, vi.fn()), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.appearance).toEqual({ pictureUrl: 'p.png', bannerUrl: '', pictureFile: null, bannerFile: null });
    const file = new File(['x'], 'b.png', { type: 'image/png' });
    act(() => result.current.setAppearance({ pictureUrl: '', bannerUrl: 'b.png', pictureFile: null, bannerFile: file }));
    expect(result.current.appearance).toEqual({ pictureUrl: '', bannerUrl: 'b.png', pictureFile: null, bannerFile: file });
  });

  it('focuses the field it is given on open', () => {
    const input = document.createElement('input');
    document.body.append(input);
    const { result } = renderHook(() => {
      const vm = useEditProfileForm(INITIAL, vi.fn());
      (vm.firstField as React.MutableRefObject<HTMLInputElement | null>).current ??= input;
      return vm;
    }, { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.firstField.current).toBe(input);
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
