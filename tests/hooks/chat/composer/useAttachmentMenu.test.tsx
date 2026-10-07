import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { useAttachmentMenu } from '@/hooks/chat/composer/useAttachmentMenu';
import { useAttachmentPickerInput } from '@/hooks/chat/composer/useAttachmentPickerInput';

const wrapper = ({ children }: { children: React.ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

describe('useAttachmentMenu', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('toggles open, and each entry closes it', () => {
    const onNewSticker = vi.fn();
    const { result } = renderHook(() => useAttachmentMenu(() => {}, onNewSticker), { wrapper });
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.newSticker());
    expect(result.current.open).toBe(false);
    expect(onNewSticker).toHaveBeenCalledOnce();
  });

  it('pick clicks the matching hidden input', () => {
    const { result } = renderHook(() => useAttachmentMenu(() => {}, () => {}), { wrapper });
    const input = document.createElement('input');
    const click = vi.spyOn(input, 'click');
    result.current.documentRef.current = input;
    act(() => result.current.toggle());
    act(() => result.current.pick('document'));
    expect(click).toHaveBeenCalledOnce();
    expect(result.current.open).toBe(false);
  });

  it('contact passes a trimmed answer on, and nothing for a blank one', () => {
    const onContact = vi.fn();
    vi.stubGlobal('prompt', vi.fn(() => '  abc '));
    const { result } = renderHook(() => useAttachmentMenu(onContact, () => {}), { wrapper });
    act(() => result.current.contact());
    expect(onContact).toHaveBeenCalledWith('abc');
    vi.stubGlobal('prompt', vi.fn(() => '  '));
    act(() => result.current.contact());
    expect(onContact).toHaveBeenCalledTimes(1);
  });
});

describe('useAttachmentPickerInput', () => {
  it('hands chosen files over and resets the input; an empty pick hands nothing', () => {
    const onFiles = vi.fn();
    const { result } = renderHook(() => useAttachmentPickerInput(onFiles));
    const file = new File(['x'], 'a.png');
    const target = { files: [file], value: 'C:\\fakepath\\a.png' };
    result.current.onChange({ target } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(target.value).toBe('');
    result.current.onChange({ target: { files: null, value: 'x' } } as unknown as React.ChangeEvent<HTMLInputElement>);
    expect(onFiles).toHaveBeenCalledTimes(1);
  });
});
