import type { TableColumn } from '@/components/ui/data/Table';
import type { Translate } from '@/i18n/keys';
import type { RelayAdminSelection } from '@/hooks/admin/relay-admin/useRelayAdminPanel';
import type { RelayAdminRow } from '@/utils/admin/relay-admin-rows';
import SelectCell from './SelectCell';
import UserCell from './UserCell';
import RoleCell from './RoleCell';

/** The relay admin table's columns: select, person, channel, role. */
export function relayAdminColumns(t: Translate, selection: RelayAdminSelection): ReadonlyArray<TableColumn<RelayAdminRow>> {
  return [
    {
      key: 'select',
      header: '',
      inset: 'md',
      className: 'w-8',
      cell: (r) => <SelectCell pubkey={r.pubkey} selected={selection.isSelected(r)} onToggle={() => selection.toggle(r)} />,
    },
    { key: 'user', header: t('admin.colUser'), cell: (r) => <UserCell pubkey={r.pubkey} /> },
    { key: 'channel', header: t('admin.colChannel'), cell: (r) => <span className="text-lc-muted">{r.groupName}</span> },
    { key: 'role', header: t('admin.colRole'), cell: (r) => <RoleCell isAdmin={r.isAdmin} /> },
  ];
}
