import { describe, expect, it } from 'vitest';
import { inboxTabs } from '@/utils/shell/panes/topbar/inbox-tabs';

describe('inboxTabs', () => {
  it('lists mentions then DMs with their counts and test ids', () => {
    expect(inboxTabs(3, 0)).toEqual([
      { key: 'mentions', count: 3, testId: 'notif-tab-mentions' },
      { key: 'dms', count: 0, testId: 'notif-tab-dms' },
    ]);
  });
});
