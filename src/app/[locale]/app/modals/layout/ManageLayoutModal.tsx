'use client';

import Text from '@/components/ui/layout/Text';
import Row from '@/components/ui/layout/Row';
import { type JsGroup } from '@/services/nostr-bridge';
import { shortHost } from '@/utils/relay-url/url-host';
import Modal from '@/components/ui/overlays/Modal';
import Button from '@/components/ui/buttons/Button';
import Input from '@/components/ui/forms/Input';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import { type ChannelLayout } from '@/services/relay/channel-layout';
import { useManageLayoutModal } from '@/hooks/shell/modals/layout/useManageLayoutModal';
import { useTranslations } from 'next-intl';
import { ChannelOrderRow } from './ChannelOrderRow';
import { LayoutCategoryCard } from './LayoutCategoryCard';

export function ManageLayoutModal({
  relayUrl,
  layout,
  channels,
  onClose,
}: {
  relayUrl: string;
  layout: ChannelLayout;
  channels: ReadonlyArray<JsGroup>;
  onClose: () => void;
}) {
  const t = useTranslations();
  const vm = useManageLayoutModal(relayUrl, layout, channels, onClose);
  const { laidOut, channelsById, drag } = vm;

  return (
    <Modal
      onClose={onClose}
      surface="card" panelClassName="flex max-h-[90vh] w-full max-w-2xl mx-4 flex-col overflow-hidden bg-lc-dark"
    >
      <ModalHeader
        title={t('mobile.layout.title')}
        subtitle={t('shell.desktop.layout.subtitle', { host: shortHost(relayUrl) })}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6">
        {/* Add category */}
        <section className="space-y-2">
          <Text as="div" variant="label" size="xs" tone="muted" weight="bold">{t('mobile.layout.newCategory')}</Text>
          <Row gap="2" align="stretch">
            <Input
              value={vm.newCategoryName}
              onChange={(e) => vm.setNewCategoryName(e.target.value)}
              onKeyDown={vm.onNewCategoryKeyDown}
              placeholder={t('mobile.layout.categoryPlaceholder')}
              size="sm"
              className="flex-1"
            />
            <Button onClick={vm.addCategory} disabled={!vm.canAddCategory} className="shrink-0">
              {t('shell.rail.addModal.add')}
            </Button>
          </Row>
        </section>

        {/* Categories list */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Text as="div" variant="label" size="xs" tone="muted" weight="bold">{t('mobile.layout.categories')}</Text>
            <Text as="div" size="11" tone="muted">{t('shell.desktop.layout.grabHint')}</Text>
          </div>
          {laidOut.categories.length === 0 && (
            <Text as="div" variant="caption" className="rounded-lg border border-dashed border-lc-border p-3 text-center">
              {t('shell.desktop.layout.empty')}
            </Text>
          )}
          {laidOut.categories.map((cat, idx) => (
            <LayoutCategoryCard
              key={cat.id}
              cat={cat}
              idx={idx}
              categories={laidOut.categories}
              channelsById={channelsById}
              drag={drag}
              renameCategory={vm.renameCategory}
              moveCategory={vm.moveCategory}
              deleteCategory={vm.deleteCategory}
              moveChannel={vm.moveChannel}
              setChannelCategory={vm.setChannelCategory}
            />
          ))}
        </section>

        {/* Uncategorized channels */}
        <section className="space-y-2">
          <Text as="div" variant="label" size="xs" tone="muted" weight="bold">
            {t('mobile.layout.uncategorizedCount', { count: laidOut.uncategorized.length })}
          </Text>
          <div
            className="space-y-1 rounded-lg"
            onDragOver={drag.bucketDragOver}
            onDrop={drag.bucketDrop}
            data-testid="layout-uncategorized"
          >
            {laidOut.uncategorized.length === 0 ? (
              <Text as="div" size="11" tone="muted" className="rounded border border-dashed border-lc-border px-2 py-2 text-center">
                {t('shell.desktop.layout.allPlaced')}
              </Text>
            ) : (
              laidOut.uncategorized.map((id, i) => (
                <ChannelOrderRow
                  key={id}
                  channel={channelsById[id]}
                  bucket={null}
                  first={i === 0}
                  last={i === laidOut.uncategorized.length - 1}
                  categories={laidOut.categories}
                  onMove={(d) => vm.moveChannel(id, d)}
                  onChangeCategory={(catId) => vm.setChannelCategory(id, catId)}
                  onGrab={() => drag.grabChannel(id)}
                  onDragEnd={drag.endDrag}
                  onDropBefore={() => drag.dropBefore(null, id)}
                />
              ))
            )}
          </div>
        </section>

        {vm.error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{vm.error}</div>}
      </div>
      <ModalFooter
        meta={t('shell.desktop.layout.saveHelp')}
        cancel={{ onClick: onClose }}
        actions={[{
          label: vm.saving ? t('shell.desktop.layout.publishing') : t('shell.desktop.layout.publish'),
          onClick: vm.save,
          disabled: vm.saving,
        }]}
      />
    </Modal>
  );
}
