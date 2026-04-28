import { describe, it, expect, beforeEach } from 'vitest';
import { useZapStore } from './zap';

describe('useZapStore', () => {
  beforeEach(() => useZapStore.setState({ pickerOpen: null }));

  it('opens and closes the picker', () => {
    useZapStore.getState().setPickerOpen({ channelId: 'c1' });
    expect(useZapStore.getState().pickerOpen).toEqual({ channelId: 'c1' });
    useZapStore.getState().setPickerOpen(null);
    expect(useZapStore.getState().pickerOpen).toBeNull();
  });

  it('carries target + amount prefill', () => {
    useZapStore.getState().setPickerOpen({ channelId: 'c1', target: 'pk', amountSats: 42 });
    expect(useZapStore.getState().pickerOpen?.amountSats).toBe(42);
    expect(useZapStore.getState().pickerOpen?.target).toBe('pk');
  });
});
