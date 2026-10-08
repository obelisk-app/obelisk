import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useCreateGroupSection } from '@/hooks/shell/panes/sidebar/useCreateGroupSection';

function setup(createGroup = vi.fn(async () => 'new-id')) {
  const onCreated = vi.fn();
  const view = renderHook(() => useCreateGroupSection(onCreated), {
    wrapper: bridgeWrapper(fakeBridge({}, { createGroup } as never)),
  });
  return { ...view, onCreated, createGroup };
}

describe('useCreateGroupSection', () => {
  it('folding the form by hand clears what was typed', () => {
    const { result } = setup();
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.form.set('name', 'dev'));
    expect(result.current.form.values.name).toBe('dev');
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
    expect(result.current.form.values.name).toBe('');
  });

  it('creating a channel folds the form and hands the id on', async () => {
    const { result, onCreated } = setup();
    act(() => result.current.toggle());
    act(() => result.current.form.set('name', 'dev'));
    await act(async () => { await result.current.form.submit({ preventDefault: () => {} } as never); });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-id'));
    expect(result.current.open).toBe(false);
  });
});
