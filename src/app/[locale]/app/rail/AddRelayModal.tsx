'use client';

import { useTranslations } from 'next-intl';
import ConcordAddCommunity from '@/app/[locale]/app/concord/ConcordAddCommunity';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Heading from '@/components/ui/layout/Heading';
import List from '@/components/ui/layout/List';
import { CreateCommunityOption } from '@/components/relay/CreateCommunityOption';
import { JoinCommunityForm } from '@/components/relay/JoinCommunityForm';
import { useAddRelay } from '@/hooks/relay/rail/useAddRelay';
import { SUGGESTED_RELAYS } from '@/services/relay/relay-info';
import { SuggestedRelayItem } from './SuggestedRelayItem';

export function AddRelayModal({ onClose, fromInvite = false }: { onClose: () => void; fromInvite?: boolean }) {
  const t = useTranslations('shell.rail.addModal');
  const vm = useAddRelay();

  return (
    <Modal onClose={onClose} surface="card"
      panelClassName="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-lc-border bg-lc-dark shadow-2xl"
    >
      <ModalHeader
        title={t(vm.creating ? 'createCommunity' : fromInvite ? 'join' : 'title')}
        subtitle={t(vm.creating ? 'createHelp' : fromInvite ? 'inviteHelp' : 'joinHelp')}
        onClose={onClose}
        onBack={vm.creating ? vm.backToJoin : undefined}
      />
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {vm.creating ? <ConcordAddCommunity onClose={onClose} /> : (
          <>
            <JoinCommunityForm onClose={onClose} fromInvite={fromInvite} />
            {!fromInvite && SUGGESTED_RELAYS.length > 0 && (
              <section className="space-y-2">
                <Heading as="h2" variant="panel">{t('suggested')}</Heading>
                <List marker="none" spacing="none" className="flex flex-col gap-2">
                  {SUGGESTED_RELAYS.map(({ url }) => (
                    <SuggestedRelayItem key={url} url={url} alreadyAdded={vm.isConfigured(url)} onAdded={onClose} />
                  ))}
                </List>
              </section>
            )}
          </>
        )}
      </div>
      {!vm.creating && !fromInvite && (
        <div className="shrink-0 border-t border-lc-border px-5 py-3">
          <CreateCommunityOption onOpen={vm.openCreate} />
        </div>
      )}
    </Modal>
  );
}
