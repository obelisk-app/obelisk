import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { signingEntry, useMobileSigningIndicator } from '@/hooks/feedback/useMobileSigningIndicator';
import { dismissActivity, failActivity, pushActivity, type ActivityEntry } from '@/services/feedback/activity-log';

const entry = (id: number, status: ActivityEntry['status'], operation?: ActivityEntry['operation']): ActivityEntry =>
  ({ id, label: String(id), status, operation, startedAt: 0 }) as ActivityEntry;

const pushed: number[] = [];
afterEach(() => { pushed.splice(0).forEach(dismissActivity); });

describe('signingEntry', () => {
  it('prefers a pending signature, then the latest one, else none', () => {
    expect(signingEntry([entry(1, 'ok', 'sign'), entry(2, 'pending', 'sign')])?.id).toBe(2);
    expect(signingEntry([entry(1, 'pending', 'publish'), entry(2, 'error', 'sign')])?.id).toBe(2);
    expect(signingEntry([entry(1, 'pending', 'publish')])).toBeNull();
  });
});

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
