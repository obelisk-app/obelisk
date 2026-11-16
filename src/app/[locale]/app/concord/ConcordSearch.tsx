'use client';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { JsGroup } from '@/services/nostr-bridge';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ConcordSearchResults from './ConcordSearchResults';

export default function ConcordSearch({ community, groups, onClose, onSelect, mobile = false }: {
  community: ConcordCommunity; groups: JsGroup[]; onClose: () => void; onSelect: (id: string) => void; mobile?: boolean;
}) {
  const t = useTranslations();
  return mobile ? <Sheet screen="search" label={t('common.search')} onClose={onClose}>
    <SheetHeader title={t('common.search')} onBack={onClose} />
    <ConcordSearchResults community={community} groups={groups} onSelect={onSelect} />
  </Sheet> : <Modal onClose={onClose} aria-label={t('common.search')} panelClassName="flex max-h-[85dvh] w-full max-w-lg flex-col rounded-2xl border border-lc-border bg-lc-dark">
    <ModalHeader title={t('common.search')} onClose={onClose} />
    <ConcordSearchResults community={community} groups={groups} onSelect={onSelect} />
  </Modal>;
}
