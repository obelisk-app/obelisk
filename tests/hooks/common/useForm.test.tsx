import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import { CodedError } from '@/utils/errors/codes';
import { useForm } from '@/hooks/common/useForm';
import type { FormSpec } from '@/constants/common/form';

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

type Values = { name: string; admin: boolean };

function setup(spec: Partial<FormSpec<Values, string>> = {}) {
  const submit = spec.submit ?? vi.fn(async () => 'done');
  const full: FormSpec<Values, string> = { initial: { name: '', admin: false }, ...spec, submit };
  return { submit, ...renderHook(() => useForm(full), { wrapper }) };
}

describe('useForm values', () => {
  it('starts from the initial values, untouched and with no error', () => {
    const { result } = setup({ initial: { name: 'a', admin: true } });
    expect(result.current.values).toEqual({ name: 'a', admin: true });
    expect(result.current.dirty).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.id).toMatch(/.+/);
  });

  it('binds a text field to an input and marks the form dirty on the first edit', () => {
    const { result } = setup();
    const binding = result.current.field('name');
    expect(binding).toMatchObject({ name: 'name', value: '' });
    act(() => binding.onChange({ target: { value: 'dev' } } as never));
    expect(result.current.values.name).toBe('dev');
    expect(result.current.dirty).toBe(true);
  });

  it('sets one field or several', () => {
    const { result } = setup();
    act(() => result.current.set('admin', true));
    act(() => result.current.setValues({ name: 'x' }));
    expect(result.current.values).toEqual({ name: 'x', admin: true });
  });

  it('adopts late values only while untouched', () => {
    const { result } = setup();
    act(() => result.current.adopt({ name: 'from relay', admin: false }));
    expect(result.current.values.name).toBe('from relay');
    expect(result.current.dirty).toBe(false);
    act(() => result.current.set('name', 'typed'));
    act(() => result.current.adopt({ name: 'later', admin: false }));
    expect(result.current.values.name).toBe('typed');
  });

  it('adopting equal values built afresh keeps the same values object', () => {
    const { result } = setup({ initial: { name: 'a', admin: false } });
    const before = result.current.values;
    act(() => result.current.adopt({ name: 'a', admin: false }));
    expect(result.current.values).toBe(before);
  });

  it('reset goes back to the last adopted values and clears the error', () => {
    const { result } = setup();
    act(() => result.current.adopt({ name: 'base', admin: false }));
    act(() => result.current.set('name', 'typed'));
    act(() => result.current.setError('x'));
    act(() => result.current.reset());
    expect(result.current.values.name).toBe('base');
    expect(result.current.error).toBeNull();
    expect(result.current.dirty).toBe(false);
  });
});

describe('useForm submit', () => {
  it('sends the values, then hands the result on', async () => {
    const onSuccess = vi.fn();
    const { result, submit } = setup({ initial: { name: 'n', admin: true }, onSuccess });
    const preventDefault = vi.fn();
    await act(() => result.current.submit({ preventDefault } as never));
    expect(preventDefault).toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith({ name: 'n', admin: true });
    expect(onSuccess).toHaveBeenCalledWith('done', { name: 'n', admin: true });
  });

  it('does nothing and says nothing while not ready', async () => {
    const { result, submit } = setup({ ready: (v) => v.name.trim() !== '' });
    expect(result.current.canSubmit).toBe(false);
    await act(() => result.current.submit());
    expect(submit).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it('shows the first problem in the reader\'s language and sends nothing', async () => {
    const { result, submit } = setup({ validate: () => 'chat.relayForm.invalidUrl' });
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Invalid URL');
    expect(submit).not.toHaveBeenCalled();
  });

  it('is busy while sending and refuses a second submit in the same tick', async () => {
    let finish!: (v: string) => void;
    const submit = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    const { result } = setup({ submit });
    let first!: Promise<void>;
    act(() => {
      first = result.current.submit();
      void result.current.submit();
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(true);
    expect(result.current.canSubmit).toBe(false);
    await act(async () => { finish('ok'); await first; });
    expect(result.current.submitting).toBe(false);
  });

  it('words an uncoded failure with the spec\'s key, a coded one with its own', async () => {
    const { result } = setup({ submit: vi.fn().mockRejectedValue(new Error('relay down')), failure: 'chat.relayForm.addFailed' });
    await act(() => result.current.submit());
    expect(result.current.error).toBe('Could not add that relay.');
    expect(result.current.submitting).toBe(false);

    const coded = setup({ submit: vi.fn().mockRejectedValue(new CodedError('invalid-relay-url', 'x')), failure: 'chat.relayForm.addFailed' });
    await act(() => coded.result.current.submit());
    expect(coded.result.current.error).toBe(translator('en')('errors.codes.invalid-relay-url'));
  });

  it('picks the failure key by error when given a function', async () => {
    const { result } = setup({
      submit: vi.fn().mockRejectedValue(new TypeError('upload')),
      failure: (e) => (e instanceof TypeError ? 'media.error.uploadFailed' : 'shell.user.publishFailed'),
    });
    await act(() => result.current.submit());
    expect(result.current.error).toBe(translator('en')('media.error.uploadFailed'));
  });

  it('can go back to the starting values after a submit that went through', async () => {
    const { result } = setup({ resetOnSuccess: true });
    act(() => result.current.set('name', 'typed'));
    await act(() => result.current.submit());
    expect(result.current.values.name).toBe('');
    expect(result.current.dirty).toBe(false);
  });

  it('clears the last error when submitting again', async () => {
    const submit = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce('ok');
    const { result } = setup({ submit, failure: 'chat.relayForm.addFailed' });
    await act(() => result.current.submit());
    expect(result.current.error).not.toBeNull();
    await act(() => result.current.submit());
    expect(result.current.error).toBeNull();
  });
});
