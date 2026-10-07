import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMobileSigningIndicator } from '@/hooks/feedback/useMobileSigningIndicator';
import { dismissActivity, failActivity, pushActivity } from '@/services/feedback/activity-log';

const pushed: number[] = [];
afterEach(() => { pushed.splice(0).forEach(dismissActivity); });

describe('useMobileSigningIndicator', () => {
  it('is idle and green with nothing signed, amber while waiting, red on failure', () => {
    const { result } = renderHook(() => useMobileSigningIndicator());
    expect(result.current).toMatchObject({ status: 'idle', dotClass: 'bg-lc-green', signing: null });
    let id = 0;
    act(() => { id = pushActivity('signExtension', undefined, { operation: 'sign' }); pushed.push(id); });
    expect(result.current.status).toBe('pending');
    expect(result.current.dotClass).toContain('bg-amber-400');
    act(() => { failActivity(id, 'nope'); });
    expect(result.current.status).toBe('error');
    expect(result.current.dotClass).toBe('bg-red-500');
  });
});
