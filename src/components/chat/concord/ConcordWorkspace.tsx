'use client';

import { useTranslations } from 'next-intl';
import { useConcordWorkspace } from '@/hooks/chat/concord/useConcordWorkspace';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import FormError from '@/components/ui/forms/FormError';
import ConcordSetup from './ConcordSetup';
import ConcordRoom from './ConcordRoom';

export default function ConcordWorkspace() {
  const t = useTranslations();
  const vm = useConcordWorkspace();
  return <Modal onClose={vm.close} testId="concord-workspace" closeOnBackdrop={false} panelClassName="flex h-[92dvh] w-[96vw] max-w-7xl flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark text-lc-white">
    <ModalHeader title={t('chat.concord.title')} subtitle={t('chat.concord.private')} onClose={vm.close} />
    <FormError>{vm.error}</FormError>
    {!vm.client ? <Text as="div" className="p-4">{t('chat.concord.loading')}</Text> : <>
      <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-lc-border p-2">
        <Button variant="bare" data-testid="concord-new" onClick={() => vm.selectCommunity('')}>{t('chat.concord.add')}</Button>
        {vm.communities.map(community => <Button key={community.material.community_id} variant="bare" data-testid="concord-community" onClick={() => vm.selectCommunity(community.material.community_id)}>{community.metadata?.name ?? community.material.name}</Button>)}
      </nav>
      {vm.community ? <ConcordRoom key={vm.community.communityId} community={vm.community} /> : <div className="overflow-y-auto"><ConcordSetup client={vm.client} onSelect={vm.selectCommunity} /></div>}
    </>}
  </Modal>;
}
