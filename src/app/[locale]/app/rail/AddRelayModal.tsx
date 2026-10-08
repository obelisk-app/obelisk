'use client';

import List from '@/components/ui/layout/List';
import { SUGGESTED_RELAYS } from '@/services/relay/relay-info';
import { useAddRelayModal } from '@/hooks/shell/rail/useAddRelayModal';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import { useTranslations } from 'next-intl';
import { AddRelayTabButton } from './AddRelayTabButton';
import { CustomRelayForm } from './CustomRelayForm';
import { SuggestedRelayItem } from './SuggestedRelayItem';

/** Add a relay to the rail: pick a suggested one, or type a URL. */
export function AddRelayModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const vm = useAddRelayModal();

  return (
    <Modal
      onClose={onClose}
      surface="card" panelClassName="flex max-h-[85vh] w-full max-w-lg mx-4 flex-col overflow-hidden rounded-2xl border border-lc-border bg-lc-dark shadow-2xl"
    >
      <ModalHeader title={t('shell.rail.addModal.title')} subtitle={t('shell.rail.addModal.subtitle')} onClose={onClose} />

      <div className="flex shrink-0 border-b border-lc-border px-5">
        <AddRelayTabButton active={vm.tab === 'suggested'} onClick={vm.showSuggested}>
          {t('shell.rail.addModal.suggested')}
        </AddRelayTabButton>
        <AddRelayTabButton active={vm.tab === 'custom'} onClick={vm.showCustom}>
          {t('shell.rail.addModal.custom')}
        </AddRelayTabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {vm.tab === 'suggested' ? (
          <List marker="none" spacing="none" className="flex flex-col gap-2">
            {SUGGESTED_RELAYS.map((r) => (
              <SuggestedRelayItem
                key={r.url}
                url={r.url}
                alreadyAdded={vm.isAdded(r.url)}
                onAdded={onClose}
              />
            ))}
          </List>
        ) : (
          <CustomRelayForm onAdded={onClose} />
        )}
      </div>
    </Modal>
  );
}
