'use client';

import { useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import ModalHeader from '@/components/ui/ModalHeader';
import {
  nostrActions,
  useAdminsByGroup,
  useGroups,
} from '@/services/nostr-bridge';
import { useUserMetadata as useProfile } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useMembersByGroupBulk } from '@/hooks/useMembersByGroupBulk';
import Button from '@/components/ui/Button';
import Checkbox from '@/components/ui/Checkbox';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Table, { type TableColumn } from '@/components/ui/Table';

interface Row {
  groupId: string;
  groupName: string;
  pubkey: string;
  isAdmin: boolean;
}

const rowKey = (r: Row) => `${r.groupId}/${r.pubkey}`;

export default function RelayAdminPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const groups = useGroups();
  const adminsByGroup = useAdminsByGroup();
  const membersByGroup = useMembersByGroupBulk();

  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'member'>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of groups) {
      const admins = new Set(adminsByGroup[g.id] ?? []);
      const members = membersByGroup[g.id] ?? [];
      const all = new Set<string>([...admins, ...members]);
      for (const pubkey of all) {
        out.push({
          groupId: g.id,
          groupName: g.name ?? g.id.slice(0, 8),
          pubkey,
          isAdmin: admins.has(pubkey),
        });
      }
    }
    return out;
  }, [groups, adminsByGroup, membersByGroup]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter === 'admin' && !r.isAdmin) return false;
      if (roleFilter === 'member' && r.isAdmin) return false;
      if (groupFilter !== 'all' && r.groupId !== groupFilter) return false;
      if (q && !(r.pubkey.toLowerCase().includes(q) || r.groupName.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filter, roleFilter, groupFilter]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedRows = useMemo(
    () => filtered.filter((r) => selected.has(rowKey(r))),
    [filtered, selected],
  );

  const columns: ReadonlyArray<TableColumn<Row>> = [
    {
      key: 'select',
      header: '',
      inset: 'md',
      className: 'w-8',
      cell: (r) => <SelectCell row={r} selected={selected.has(rowKey(r))} onToggle={() => toggle(rowKey(r))} />,
    },
    { key: 'user', header: t('admin.colUser'), cell: (r) => <UserCell pubkey={r.pubkey} /> },
    { key: 'channel', header: t('admin.colChannel'), cell: (r) => <span className="text-lc-muted">{r.groupName}</span> },
    { key: 'role', header: t('admin.colRole'), cell: (r) => <RoleCell isAdmin={r.isAdmin} /> },
  ];

  async function bulk(action: 'kick' | 'demote') {
    if (selectedRows.length === 0) return;
    const count = String(selectedRows.length);
    const sample = selectedRows.slice(0, 3).map((r) => `${shortNpubLabel(r.pubkey)} · ${r.groupName}`).join('\n');
    const more = selectedRows.length > 3
      ? '\n' + t('admin.bulk.more').replace('{count}', String(selectedRows.length - 3))
      : '';
    const ok = await confirmDialog({
      title: t(action === 'kick' ? 'admin.bulk.confirmRemove' : 'admin.bulk.confirmDemote').replace('{count}', count),
      message: sample + more,
      confirmLabel: t(action === 'kick' ? 'confirm.remove' : 'confirm.demote'),
      icon: action === 'kick' ? 'trash' : 'none',
    });
    if (!ok) return;
    setBusy(true);
    try {
      for (const r of selectedRows) {
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
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} panelClassName="w-full max-w-3xl mx-4 rounded-xl bg-lc-dark border border-lc-border shadow-xl flex flex-col max-h-[85vh]">
      <ModalHeader
        title={t('admin.title')}
        subtitle="Bulk cleanup across every channel on this relay. Kick removes the user (kind 9001); demote strips the admin role only (kind 9003)."
        onClose={onClose}
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-lc-border px-5 py-3">
        <Input
          size="sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('admin.filterPlaceholder')}
          aria-label={t('admin.filterPlaceholder')}
          className="min-w-[200px] flex-1"
        />
        <Select
          size="xs"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
          aria-label={t('admin.colRole')}
        >
          <option value="all">{t('admin.allRoles')}</option>
          <option value="admin">{t('admin.adminsOnly')}</option>
          <option value="member">{t('admin.membersOnly')}</option>
        </Select>
        <Select
          size="xs"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          aria-label={t('admin.colChannel')}
          className="max-w-[180px]"
        >
          <option value="all">{t('admin.allChannels')}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name ?? g.id.slice(0, 12)}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Table
          aria-label={t('admin.title')}
          columns={columns}
          rows={filtered}
          rowKey={rowKey}
          header="sticky"
          emptyPlacement="replace"
          emptyPadding="none"
          emptyClassName="px-5 py-8"
          empty={rows.length === 0
            ? 'No admin or member entries on this relay yet.'
            : 'No entries match the current filters.'}
        />
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-lc-border px-5 py-3">
        <div className="text-xs text-lc-muted">
          {selectedRows.length} selected · {filtered.length} shown · {rows.length} total
        </div>
        <div className="flex gap-2">
          <Button
            variant="pillSecondary"
            size="xs"
            onClick={() => bulk('demote')}
            disabled={busy || selectedRows.every((r) => !r.isAdmin)}
            title={t('admin.demoteHelp')}
          >
            {t('mobile.members.demote')}
          </Button>
          <Button
            variant="pillDanger"
            size="xs"
            onClick={() => bulk('kick')}
            disabled={busy || selectedRows.length === 0}
          >
            {t('mobile.members.kick')}
          </Button>
        </div>
      </footer>
    </Modal>
  );
}

function SelectCell({ row, selected, onToggle }: { row: Row; selected: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const meta = useProfile(row.pubkey);
  const user = meta?.displayName || meta?.name || shortNpubLabel(row.pubkey);
  return (
    <Checkbox
      checked={selected}
      onChange={onToggle}
      aria-label={t('admin.selectRow').replace('{user}', user)}
      className="cursor-pointer"
    />
  );
}

function UserCell({ pubkey }: { pubkey: string }) {
  const meta = useProfile(pubkey);
  return (
    <>
      <div className="truncate text-lc-white">
        {meta?.displayName || meta?.name || pubkey.slice(0, 12)}
      </div>
      <div className="truncate font-mono text-[10px] text-lc-muted">{pubkey}</div>
    </>
  );
}

function RoleCell({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation();
  return isAdmin ? (
    <span className="rounded-full bg-lc-green/20 px-2 py-0.5 text-[10px] font-bold uppercase text-lc-green">
      {t('mobile.members.admin')}
    </span>
  ) : (
    <span className="text-xs text-lc-muted">{t('admin.member')}</span>
  );
}
