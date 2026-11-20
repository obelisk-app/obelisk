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
      className: 'w-10 sm:w-12',
      cell: (r) => <SelectCell pubkey={r.pubkey} selected={selection.isSelected(r)} onToggle={() => selection.toggle(r)} />,
    },
    { key: 'user', header: t('admin.colUser'), cell: (r) => <UserCell pubkey={r.pubkey} /> },
    { key: 'channel', header: t('admin.colChannel'), className: 'w-[28%] sm:w-[30%]', cell: (r) => <span className="block truncate text-xs text-lc-muted sm:text-sm" title={r.groupName}>{r.groupName}</span> },
    { key: 'role', header: t('admin.colRole'), className: 'w-16 sm:w-24', cell: (r) => <RoleCell isAdmin={r.isAdmin} /> },
  ];
}
