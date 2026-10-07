'use client';

import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/Modal';
import ModalHeader from '@/components/ui/ModalHeader';
import Table from '@/components/ui/Table';
import { useRelayAdminPanel } from '@/hooks/admin/relay-admin/useRelayAdminPanel';
import { relayAdminRowKey } from '@/utils/admin/relay-admin-rows';
import { relayAdminColumns } from './columns';
import RelayAdminToolbar from './RelayAdminToolbar';
import RelayAdminFooter from './RelayAdminFooter';

/**
 * Relay admins & members: every admin and member of every channel on the
 * relay in one table, filtered from the toolbar, with bulk kick and demote in
 * the footer. State and actions come from `useRelayAdminPanel`; the rows are
 * built in `src/utils/admin/relay-admin-rows.ts` and the bulk actions run in
 * `src/services/admin/relay-admin-bulk.ts`.
 */
export default function RelayAdminPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const vm = useRelayAdminPanel();
  return (
    <Modal onClose={onClose} panelClassName="w-full max-w-3xl mx-4 rounded-xl bg-lc-dark border border-lc-border shadow-xl flex flex-col max-h-[85vh]">
      <ModalHeader title={t('admin.title')} subtitle={t('admin.subtitle')} onClose={onClose} />
      <RelayAdminToolbar filters={vm.filters} groupOptions={vm.groupOptions} />
      <div className="flex-1 overflow-y-auto">
        <Table
          aria-label={t('admin.title')}
          columns={relayAdminColumns(t, vm.selection)}
          rows={vm.rows}
          rowKey={relayAdminRowKey}
          header="sticky"
          emptyPlacement="replace"
          emptyPadding="none"
          emptyClassName="px-5 py-8"
          empty={t(vm.emptyKey)}
        />
      </div>
      <RelayAdminFooter vm={vm} />
    </Modal>
  );
}
