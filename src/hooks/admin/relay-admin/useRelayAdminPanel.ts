import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminsByGroup, useGroups } from '@/services/nostr-bridge';
import { useMembersByGroupBulk } from '@/hooks/useMembersByGroupBulk';
import {
  buildRelayAdminRows, filterRelayAdminRows, relayAdminGroupName, relayAdminRowKey, selectedRelayAdminRows, toggleKey,
  type RelayAdminRoleFilter, type RelayAdminRow,
} from '@/utils/admin/relay-admin-rows';
import { confirmAndRunRelayAdminBulk, type RelayAdminBulkAction } from '@/services/admin/relay-admin-bulk';

/**
 * The relay admin panel's view model: every admin and member of every
 * channel on the relay, the toolbar's three filters, the row selection and
 * the two bulk actions. The panel and its parts only render what this
 * returns (docs/conventions.md#component-files).
 */
export function useRelayAdminPanel() {
  const t = useTranslations();
  const groups = useGroups();
  const adminsByGroup = useAdminsByGroup();
  const membersByGroup = useMembersByGroupBulk();

  const [text, setText] = useState('');
  const [role, setRole] = useState<RelayAdminRoleFilter>('all');
  const [group, setGroup] = useState('all');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => buildRelayAdminRows(groups, adminsByGroup, membersByGroup),
    [groups, adminsByGroup, membersByGroup],
  );
  const shown = useMemo(() => filterRelayAdminRows(rows, { text, role, group }), [rows, text, role, group]);
  const selectedRows = useMemo(() => selectedRelayAdminRows(shown, selected), [shown, selected]);

  const bulk = async (action: RelayAdminBulkAction) => {
    const ran = await confirmAndRunRelayAdminBulk(action, selectedRows, t, () => setBusy(true)).finally(() => setBusy(false));
    if (ran) setSelected(new Set());
  };

  return {
    /** The channel select's options; a nameless channel shows 12 characters of its id. */
    groupOptions: groups.map((g) => ({ value: g.id, label: relayAdminGroupName(g, 12) })),
    filters: { text, role, group, setText, setRole, setGroup },
    rows: shown,
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
