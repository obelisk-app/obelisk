import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const publishBranding = vi.fn();
vi.mock('@/services/relay-branding', () => ({
  publishBranding: (...a: unknown[]) => publishBranding(...a),
}));

import { useRelayBrandingForm } from '@/hooks/chat/useRelayBrandingForm';

const BRANDING = { icon: ' https://cdn/i.png ', banner: '', name: 'Obelisk ', description: 'A relay', updatedAt: 1 };

afterEach(() => publishBranding.mockReset());

describe('useRelayBrandingForm', () => {
  it('seeds every field from the current branding', () => {
    const { result } = renderHook(() => useRelayBrandingForm('wss://r', BRANDING, () => {}));
    expect(result.current.name).toBe('Obelisk ');
    expect(result.current.description).toBe('A relay');
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('publishes trimmed fields with a fresh updatedAt and reports success', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_500);
    publishBranding.mockResolvedValueOnce(undefined);
    const onSaved = vi.fn();
    const { result } = renderHook(() => useRelayBrandingForm('wss://r', BRANDING, onSaved));
    act(() => result.current.setDescription('  Updated  '));
    await act(() => result.current.save());
    expect(publishBranding).toHaveBeenCalledWith('wss://r', {
      icon: 'https://cdn/i.png',
      banner: '',
      name: 'Obelisk',
      description: 'Updated',
      updatedAt: 1_700_000_000,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(result.current.saving).toBe(false);
    vi.useRealTimers();
  });

  it('keeps the form open and shows the message when publishing fails', async () => {
    publishBranding.mockRejectedValueOnce(new Error('relay refused'));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useRelayBrandingForm('wss://r', BRANDING, onSaved));
    await act(() => result.current.save());
    expect(result.current.error).toBe('relay refused');
    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(false);
  });
});
