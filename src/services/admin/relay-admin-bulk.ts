/**
 * The relay admin panel's bulk actions: ask once, then remove each selected
 * person from their channel (kick) or take their admin role (demote). One
 * failure does not stop the rest; it is logged and the loop goes on.
 */

import { nostrActions } from '@/services/nostr-bridge';
import { confirmDialog } from '@/services/common/confirm-dialog';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import type { Translate } from '@/i18n/keys';
import type { RelayAdminRow } from '@/utils/admin/relay-admin-rows';

export type RelayAdminBulkAction = 'kick' | 'demote';

/** How many rows the confirmation names before "and N more". */
const SAMPLE = 3;

/** The confirmation's body: the first few people and channels, then "and N more". */
export function bulkConfirmMessage(rows: ReadonlyArray<RelayAdminRow>, t: Translate): string {
  const sample = rows.slice(0, SAMPLE).map((r) => `${shortNpubLabel(r.pubkey)} · ${r.groupName}`).join('\n');
  const more = rows.length > SAMPLE ? '\n' + t('admin.bulk.more', { count: String(rows.length - SAMPLE) }) : '';
  return sample + more;
}

/** Run the action on every row, without asking. Demote skips rows that are not admins. */
export async function runRelayAdminBulk(action: RelayAdminBulkAction, rows: ReadonlyArray<RelayAdminRow>): Promise<void> {
  for (const r of rows) {
    try {
      if (action === 'kick') {
        await nostrActions.removeUser(r.groupId, r.pubkey);
      } else if (r.isAdmin) {
        await nostrActions.removePermission(r.groupId, r.pubkey, ['admin']);
      }
    } catch (err) {
      console.warn(`[RelayAdminPanel] ${action} failed`, r, err);
    }
  }
}

/**
 * Ask, then act. Resolves `false` when there was nothing to do or the person
 * cancelled, `true` once every row has been tried. `onStart` runs after the
 * confirmation and before the first relay call (the panel disables its
 * buttons there).
 */
export async function confirmAndRunRelayAdminBulk(
  action: RelayAdminBulkAction,
  rows: ReadonlyArray<RelayAdminRow>,
  t: Translate,
  onStart: () => void = () => {},
): Promise<boolean> {
  if (rows.length === 0) return false;
  const count = String(rows.length);
  const ok = await confirmDialog({
    title: t(action === 'kick' ? 'admin.bulk.confirmRemove' : 'admin.bulk.confirmDemote', { count }),
    message: bulkConfirmMessage(rows, t),
    confirmLabel: t(action === 'kick' ? 'common.confirm.remove' : 'common.confirm.demote'),
    icon: action === 'kick' ? 'trash' : 'none',
  });
  if (!ok) return false;
  onStart();
  await runRelayAdminBulk(action, rows);
  return true;
}
