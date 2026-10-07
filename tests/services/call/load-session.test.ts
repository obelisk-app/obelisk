import { describe, expect, it, vi } from 'vitest';

const ctl = vi.hoisted(() => ({ evaluated: 0 }));
vi.mock('@/services/call/session', () => {
  ctl.evaluated++;
  return { DmCallSession: class {} };
});

import { loadDmCallSession, prefetchDmCallSession } from '@/services/call/load-session';

describe('loadDmCallSession', () => {
  it('fetches the session module on first use only, and hands every caller the same one', async () => {
    expect(ctl.evaluated).toBe(0);
    prefetchDmCallSession();
    const [a, b] = await Promise.all([loadDmCallSession(), loadDmCallSession()]);
    expect(a).toBe(b);
    expect(typeof a.DmCallSession).toBe('function');
    expect(ctl.evaluated).toBe(1);
  });
});
