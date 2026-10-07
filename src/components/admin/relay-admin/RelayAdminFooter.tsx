'use client';

import { useTranslations } from 'next-intl';
import ModalFooter from '@/components/ui/ModalFooter';
import type { RelayAdminPanelModel } from '@/hooks/admin/relay-admin/useRelayAdminPanel';

/** The counts on the left, demote and kick on the right. */
export default function RelayAdminFooter({ vm }: { vm: RelayAdminPanelModel }) {
  const t = useTranslations();
  return (
    <ModalFooter
      meta={t('admin.counts', { selected: vm.selectedCount, shown: vm.rows.length, total: vm.totalCount })}
      actions={[
        { label: t('mobile.members.demote'), onClick: vm.demote, disabled: !vm.canDemote, tone: 'secondary', title: t('admin.demoteHelp') },
        { label: t('mobile.members.kick'), onClick: vm.kick, disabled: !vm.canKick, tone: 'danger' },
      ]}
    />
  );
}
