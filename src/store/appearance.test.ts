import { describe, it, expect, beforeEach } from 'vitest';
import { useAppearanceStore } from './appearance';

describe('appearance store', () => {
  beforeEach(() => {
    useAppearanceStore.setState({ theme: 'lc-default', density: 'cozy', reducedMotion: false });
  });

  it('stores theme choice', () => {
    useAppearanceStore.getState().setTheme('lc-default');
    expect(useAppearanceStore.getState().theme).toBe('lc-default');
  });

  it('toggles density and reduced motion', () => {
    useAppearanceStore.getState().setDensity('compact');
    useAppearanceStore.getState().setReducedMotion(true);
    expect(useAppearanceStore.getState().density).toBe('compact');
    expect(useAppearanceStore.getState().reducedMotion).toBe(true);
  });
});
