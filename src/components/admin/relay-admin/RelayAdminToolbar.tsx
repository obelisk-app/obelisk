'use client';

import { useTranslations } from 'next-intl';
import { SearchIcon } from '@/assets/icons';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
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
    <div className="grid grid-cols-2 items-center gap-2 border-b border-lc-border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(8rem,11rem)] sm:px-5">
      <Input
        size="sm"
        prefix={<SearchIcon size={16} />}
        wrapperClassName="col-span-2 min-w-0 sm:col-span-1"
        value={filters.text}
        onChange={(e) => filters.setText(e.target.value)}
        placeholder={t('admin.filterPlaceholder')}
        aria-label={t('admin.filterPlaceholder')}
      />
      <Select
        size="sm"
        value={filters.role}
        onChange={(e) => filters.setRole(e.target.value as RelayAdminRoleFilter)}
        aria-label={t('admin.colRole')}
      >
        <option value="all">{t('admin.allRoles')}</option>
        <option value="admin">{t('admin.adminsOnly')}</option>
        <option value="member">{t('admin.membersOnly')}</option>
      </Select>
      <Select
        size="sm"
        value={filters.group}
        onChange={(e) => filters.setGroup(e.target.value)}
        aria-label={t('admin.colChannel')}
        className="min-w-0"
      >
        <option value="all">{t('admin.allChannels')}</option>
        {groupOptions.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
      </Select>
    </div>
  );
}
