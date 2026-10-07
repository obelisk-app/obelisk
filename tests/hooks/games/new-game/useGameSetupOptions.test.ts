import { renderHook } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CR_SIZES } from '@/lib/games/chain-reaction/chain-reaction';
import type { NewGameForm } from '@/hooks/games/new-game/useNewGameForm';
import { useGameSetupOptions } from '@/hooks/games/new-game/useGameSetupOptions';

function setup() {
  const loadSave = vi.fn(async () => {});
  const form = { selected: null, seed: '42', loadSave } as unknown as NewGameForm;
  const { result } = renderHook(() => useGameSetupOptions(form));
  return { loadSave, vm: result.current };
}

const pick = (files: File[]) => {
  const target = { files, value: 'C:\\fakepath\\save.json' };
  return { target, event: { target } as unknown as ChangeEvent<HTMLInputElement> };
};

describe('useGameSetupOptions', () => {
  it('passes the form through and lists the board sizes', () => {
    const { vm } = setup();
    expect(vm.seed).toBe('42');
    expect(vm.sizes).toEqual(Object.keys(CR_SIZES));
  });

  it('hands a picked save to the form and clears the input, so the same file can be picked again', () => {
    const { vm, loadSave } = setup();
    const file = new File(['{}'], 'save.json', { type: 'application/json' });
    const { target, event } = pick([file]);
    vm.pickSave(event);
    expect(loadSave).toHaveBeenCalledWith(file);
    expect(target.value).toBe('');
  });

  it('does nothing but clear the input when the picker was cancelled', () => {
    const { vm, loadSave } = setup();
    const { target, event } = pick([]);
    vm.pickSave(event);
    expect(loadSave).not.toHaveBeenCalled();
    expect(target.value).toBe('');
  });
});
