import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/bridge-slot';
import * as confirm from '@/services/confirm-dialog';
import type { Translate } from '@/i18n/keys';
import type { RelayAdminRow } from '@/utils/admin/relay-admin-rows';
import { bulkConfirmMessage, confirmAndRunRelayAdminBulk, runRelayAdminBulk } from '@/services/admin/relay-admin-bulk';

const t = ((key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key)) as unknown as Translate;
const row = (n: number, isAdmin = false): RelayAdminRow => ({ groupId: `g${n}`, groupName: `chan${n}`, pubkey: String(n).repeat(64), isAdmin });

let removeUser: ReturnType<typeof vi.fn<(groupId: string, pubkey: string) => Promise<void>>>;
let removePermission: ReturnType<typeof vi.fn<(groupId: string, pubkey: string, permissions: readonly string[]) => Promise<void>>>;

beforeEach(() => {
  removeUser = vi.fn(async (_g: string, _p: string) => {});
  removePermission = vi.fn(async (_g: string, _p: string, _perms: readonly string[]) => {});
  registerBridge(fakeBridge({}, { removeUser, removePermission }));
});
afterEach(() => {
  unregisterBridge();
  vi.restoreAllMocks();
});

describe('runRelayAdminBulk', () => {
  it('kicks every row', async () => {
    await runRelayAdminBulk('kick', [row(1), row(2, true)]);
    expect(removeUser.mock.calls).toEqual([['g1', '1'.repeat(64)], ['g2', '2'.repeat(64)]]);
  });

  it('demotes only the admins', async () => {
    await runRelayAdminBulk('demote', [row(1), row(2, true)]);
    expect(removePermission.mock.calls).toEqual([['g2', '2'.repeat(64), ['admin']]]);
  });

  it('keeps going after one failure, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    removeUser.mockRejectedValueOnce(new Error('relay said no'));
    await runRelayAdminBulk('kick', [row(1), row(2)]);
    expect(removeUser).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('confirmAndRunRelayAdminBulk', () => {
  it('does not ask when nothing is selected', async () => {
    const ask = vi.spyOn(confirm, 'confirmDialog');
    expect(await confirmAndRunRelayAdminBulk('kick', [], t)).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks with the count and a sample, then acts, calling onStart first', async () => {
    const ask = vi.spyOn(confirm, 'confirmDialog').mockResolvedValue(true);
    const onStart = vi.fn(() => expect(removeUser).not.toHaveBeenCalled());
    expect(await confirmAndRunRelayAdminBulk('kick', [row(1)], t, onStart)).toBe(true);
    expect(ask.mock.calls[0][0]).toMatchObject({
      title: 'admin.bulk.confirmRemove {"count":"1"}',
      confirmLabel: 'common.confirm.remove',
      icon: 'trash',
    });
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(removeUser).toHaveBeenCalledTimes(1);
  });

  it('uses the demote copy and no icon for a demotion', async () => {
    const ask = vi.spyOn(confirm, 'confirmDialog').mockResolvedValue(true);
    await confirmAndRunRelayAdminBulk('demote', [row(1, true)], t);
    expect(ask.mock.calls[0][0]).toMatchObject({ confirmLabel: 'common.confirm.demote', icon: 'none' });
  });

  it('does nothing when cancelled', async () => {
    vi.spyOn(confirm, 'confirmDialog').mockResolvedValue(false);
    const onStart = vi.fn();
    expect(await confirmAndRunRelayAdminBulk('kick', [row(1)], t, onStart)).toBe(false);
    expect(onStart).not.toHaveBeenCalled();
    expect(removeUser).not.toHaveBeenCalled();
  });
});

describe('bulkConfirmMessage', () => {
  it('names up to three rows, then says how many more', () => {
    const message = bulkConfirmMessage([row(1), row(2), row(3), row(4), row(5)], t);
    const lines = message.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^npub1.* · chan1$/);
    expect(lines[3]).toBe('admin.bulk.more {"count":"2"}');
  });

  it('adds nothing for three or fewer', () => {
    expect(bulkConfirmMessage([row(1)], t).split('\n')).toHaveLength(1);
  });
});
