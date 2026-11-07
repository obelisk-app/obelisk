'use client';

import Text from '@/components/ui/layout/Text';

import type { JsMediaPack } from '@/services/nostr-bridge';
import type { EditablePack, MediaTransfer } from '@/types/media/library';
import { useMediaTransfer } from '@/hooks/media/library/useMediaTransfer';
import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import Select from '@/components/ui/forms/Select';
import Button from '@/components/ui/buttons/Button';
import FormError from '@/components/ui/forms/FormError';

/** Source packs and an owned destination for a copy or merge. */
export default function MediaTransferDialog({ transfer, packs, myPubkey, serverDraft, onPreview, onClose }: {
  transfer: MediaTransfer;
  packs: readonly JsMediaPack[];
  myPubkey: string | null | undefined;
  serverDraft?: EditablePack;
  onPreview: (draft: EditablePack) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const vm = useMediaTransfer({ transfer, packs, myPubkey, serverDraft, onPreview });
  return <Modal layerClassName="z-[140]" onClose={onClose} panelClassName="mx-3 flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark" testId="media-transfer">
    <ModalHeader title={t('media.manage.merge')} onClose={onClose} />
    <div className="min-h-0 space-y-3 overflow-y-auto p-4">
      <Text as="p" className="text-sm text-lc-muted">{t('media.manage.copyHelp')}</Text>
      <Select label={t('media.manage.destination')} aria-label={t('media.manage.destination')} value={vm.destination} onChange={(event) => vm.setDestination(event.target.value)}>
        {transfer.destination && <option value="draft">{transfer.destination.title}</option>}
        {serverDraft && <option value="server">{t('media.manage.serverList')}</option>}
        <option value="new">{t('media.createPack')}</option>
        {vm.owned.map((pack) => <option key={pack.address} value={pack.address}>{pack.title}</option>)}
      </Select>
      <Text as="p">{t('media.manage.sources')}</Text>
      <div className="grid gap-2">
        {packs.map((pack) => <Button key={pack.address} variant="outline" aria-pressed={vm.addresses.includes(pack.address)} onClick={() => vm.toggle(pack.address)}>{pack.title} ({pack.items.length})</Button>)}
      </div>
      <FormError>{vm.error}</FormError>
    </div>
    <ModalFooter cancel={{ onClick: onClose }} actions={[{ label: t('media.manage.preview'), onClick: vm.preview }]} />
  </Modal>;
}
