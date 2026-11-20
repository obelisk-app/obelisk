import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminsByGroup, useGroups, useRelayPeople } from '@/services/nostr-bridge';
import { useMembersByGroupBulk } from '@/hooks/chat/members/useMembersByGroupBulk';
import {
  buildRelayAdminRows, filterRelayAdminRows, groupRelayAdminPeople, relayAdminChannelOptions, relayAdminRowKey, selectedRelayAdminRows, toggleKey,
  type RelayAdminRoleFilter, type RelayAdminRow,
} from '@/utils/admin/relay-admin-rows';
import { confirmAndRunRelayAdminBulk, type RelayAdminBulkAction } from '@/services/admin/relay-admin-bulk';

/**
 * The relay admin panel's view model: every admin and member of every
 * channel on the relay, the toolbar's three filters, the row selection and
 * the two bulk actions. The panel and its parts only render what this
 * returns (docs/ui/conventions.md#component-files).
 */
export function useRelayAdminPanel() {
  const t = useTranslations();
  const groups = useGroups();
  const adminsByGroup = useAdminsByGroup();
  const membersByGroup = useMembersByGroupBulk();

  const [text, setText] = useState('');
  const people = useRelayPeople(undefined, !!text.trim());
  const names = useMemo(() => new Map(people.map(person => [person.pubkey, person.displayName])), [people]);
  const [role, setRole] = useState<RelayAdminRoleFilter>('all');
  const [group, setGroup] = useState('all');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => buildRelayAdminRows(groups, adminsByGroup, membersByGroup),
    [groups, adminsByGroup, membersByGroup],
  );
  const shown = useMemo(() => filterRelayAdminRows(rows, { text, role, group }, names), [rows, text, role, group, names]);
  const personRows = useMemo(() => groupRelayAdminPeople(shown), [shown]);
  const groupOptions = useMemo(() => relayAdminChannelOptions(groups), [groups]);
  const groupLabels = useMemo(() => new Map(groupOptions.map(option => [option.value, option.label])), [groupOptions]);
  const selectedRows = useMemo(() => selectedRelayAdminRows(shown, selected), [shown, selected]);

  const bulk = async (action: RelayAdminBulkAction) => {
    const ran = await confirmAndRunRelayAdminBulk(action, selectedRows, t, () => setBusy(true)).finally(() => setBusy(false));
    if (ran) setSelected(new Set());
  };

  return {
    groupOptions, groupLabels,
    filters: { text, role, group, setText, setRole, setGroup },
    rows: personRows,
    shownCount: shown.length,
    totalCount: rows.length,
    selectedCount: selectedRows.length,
    emptyKey: rows.length === 0 ? 'admin.emptyRelay' as const : 'admin.emptyFiltered' as const,
    selection: {
      isSelected: (row: RelayAdminRow) => selected.has(relayAdminRowKey(row)),
      toggle: (row: RelayAdminRow) => setSelected((prev) => toggleKey(prev, relayAdminRowKey(row))),
    },
    canKick: !busy && selectedRows.length > 0,
    canDemote: !busy && selectedRows.some((r) => r.isAdmin),
    kick: () => void bulk('kick'),
    demote: () => void bulk('demote'),
  };
}

export type RelayAdminPanelModel = ReturnType<typeof useRelayAdminPanel>;
export type RelayAdminSelection = RelayAdminPanelModel['selection'];
export type RelayAdminFilterState = RelayAdminPanelModel['filters'];
