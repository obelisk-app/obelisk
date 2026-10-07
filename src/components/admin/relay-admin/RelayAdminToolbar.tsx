'use client';

import { useTranslations } from 'next-intl';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import type { RelayAdminFilterState } from '@/hooks/admin/relay-admin/useRelayAdminPanel';
import type { RelayAdminRoleFilter } from '@/utils/admin/relay-admin-rows';

export interface RelayAdminToolbarProps {
  filters: RelayAdminFilterState;
  groupOptions: ReadonlyArray<{ value: string; label: string }>;
}

/** The filters above the table: free text, role and channel. */
export default function RelayAdminToolbar({ filters, groupOptions }: RelayAdminToolbarProps) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-lc-border px-5 py-3">
      <Input
        size="sm"
        value={filters.text}
        onChange={(e) => filters.setText(e.target.value)}
        placeholder={t('admin.filterPlaceholder')}
        aria-label={t('admin.filterPlaceholder')}
        className="min-w-[200px] flex-1"
      />
      <Select
        size="xs"
        value={filters.role}
        onChange={(e) => filters.setRole(e.target.value as RelayAdminRoleFilter)}
        aria-label={t('admin.colRole')}
      >
        <option value="all">{t('admin.allRoles')}</option>
        <option value="admin">{t('admin.adminsOnly')}</option>
        <option value="member">{t('admin.membersOnly')}</option>
      </Select>
      <Select
        size="xs"
        value={filters.group}
        onChange={(e) => filters.setGroup(e.target.value)}
        aria-label={t('admin.colChannel')}
        className="max-w-[180px]"
      >
        <option value="all">{t('admin.allChannels')}</option>
        {groupOptions.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
      </Select>
    </div>
  );
}
