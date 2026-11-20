import type { TableColumn } from '@/components/ui/data/Table';
import type { Translate } from '@/i18n/keys';
import type { RelayAdminSelection } from '@/hooks/admin/relay-admin/useRelayAdminPanel';
import type { RelayAdminPerson } from '@/utils/admin/relay-admin-rows';
import UserCell from './UserCell';
import MembershipsCell from './MembershipsCell';

export function relayAdminColumns(t: Translate, selection: RelayAdminSelection, groupLabels: ReadonlyMap<string, string>): ReadonlyArray<TableColumn<RelayAdminPerson>> {
  return [
    { key: 'user', header: t('admin.colUser'), className: 'w-[40%] align-top', cell: person => <UserCell pubkey={person.pubkey} /> },
    { key: 'memberships', header: t('admin.colMemberships'), className: 'align-top', cell: person => <MembershipsCell memberships={person.memberships} selection={selection} groupLabels={groupLabels} /> },
  ];
}
