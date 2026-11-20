import type { RelayAdminSelection } from '@/hooks/admin/relay-admin/useRelayAdminPanel';
import { relayAdminRowKey, type RelayAdminRow } from '@/utils/admin/relay-admin-rows';
import SelectCell from './SelectCell';
import RoleCell from './RoleCell';

export default function MembershipsCell({ memberships, selection, groupLabels }: {
  memberships: readonly RelayAdminRow[];
  selection: RelayAdminSelection;
  groupLabels: ReadonlyMap<string, string>;
}) {
  return <ul className="space-y-1">
    {memberships.map(row => <li key={relayAdminRowKey(row)}
      className={`flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 ${selection.isSelected(row) ? 'bg-lc-green/15' : 'bg-lc-card/60'}`}>
      <SelectCell pubkey={row.pubkey} channel={groupLabels.get(row.groupId) ?? row.groupName} selected={selection.isSelected(row)} onToggle={() => selection.toggle(row)} />
      <span className="min-w-0 flex-1 break-words text-xs sm:text-sm">{groupLabels.get(row.groupId) ?? row.groupName}</span>
      <RoleCell isAdmin={row.isAdmin} />
    </li>)}
  </ul>;
}
