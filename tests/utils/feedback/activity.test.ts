import { describe, expect, it } from 'vitest';
import { signingEntry, visibleActivity } from '@/utils/feedback/activity';
import type { ActivityEntry } from '@/services/feedback/activity-log';

const entry = (id: number, status: ActivityEntry['status'], operation?: ActivityEntry['operation']): ActivityEntry =>
  ({ id, label: String(id), status, operation, startedAt: 0 }) as ActivityEntry;

describe('visibleActivity', () => {
  const items = [entry(1, 'pending', 'publish'), entry(2, 'pending', 'sign'), entry(3, 'ok')];

  it('puts a pending signature wait ahead of everything else', () => {
    expect(visibleActivity(items, { show: true, hideSigning: false }).map((e) => e.id)).toEqual([2]);
  });

  it('shows only the newest entry otherwise', () => {
    const noSign = [entry(1, 'ok'), entry(2, 'error'), entry(3, 'pending', 'sign')];
    noSign[2] = { ...noSign[2], status: 'ok' };
    expect(visibleActivity(noSign, { show: true, hideSigning: false }).map((e) => e.id)).toEqual([1]);
  });

  it('shows nothing when the preference is off or signing is hidden', () => {
    expect(visibleActivity(items, { show: false, hideSigning: false })).toEqual([]);
    expect(visibleActivity(items, { show: true, hideSigning: true })).toEqual([]);
    expect(visibleActivity([], { show: true, hideSigning: false })).toEqual([]);
  });
});

describe('signingEntry', () => {
  it('prefers a pending signature, then the latest one, else none', () => {
    expect(signingEntry([entry(1, 'ok', 'sign'), entry(2, 'pending', 'sign')])?.id).toBe(2);
    expect(signingEntry([entry(1, 'pending', 'publish'), entry(2, 'error', 'sign')])?.id).toBe(2);
    expect(signingEntry([entry(1, 'pending', 'publish')])).toBeNull();
  });
});
