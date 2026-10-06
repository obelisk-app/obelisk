import { beforeEach, describe, expect, it, vi } from 'vitest';

const removeRelay = vi.fn();
const confirm = vi.fn();
vi.mock('@/services/nostr-bridge', () => ({ nostrActions: { removeRelay: (u: string) => removeRelay(u) } }));
vi.mock('@/services/confirm-dialog', () => ({ confirmDialog: (o: unknown) => confirm(o) }));

import { confirmAndRemoveRelay } from '@/services/remove-relay';

const t = (k: string) => k;

describe('confirmAndRemoveRelay', () => {
  beforeEach(() => { removeRelay.mockReset(); confirm.mockReset(); });

  it('removes the relay once the user confirms', async () => {
    confirm.mockResolvedValue(true);
    await confirmAndRemoveRelay('wss://a.example', 2, t);
    expect(removeRelay).toHaveBeenCalledWith('wss://a.example');
  });

  it('keeps it when the user cancels', async () => {
    confirm.mockResolvedValue(false);
    await confirmAndRemoveRelay('wss://a.example', 2, t);
    expect(removeRelay).not.toHaveBeenCalled();
  });

  it('never removes the last relay, and does not even ask', async () => {
    await confirmAndRemoveRelay('wss://a.example', 1, t);
    expect(confirm).not.toHaveBeenCalled();
    expect(removeRelay).not.toHaveBeenCalled();
  });
});
