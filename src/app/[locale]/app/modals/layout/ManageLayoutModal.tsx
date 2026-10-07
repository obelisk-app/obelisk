'use client';

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
      panelClassName="lc-card flex max-h-[90vh] w-full max-w-2xl mx-4 flex-col overflow-hidden bg-lc-dark"
    >
        <ModalHeader
          title={t('mobile.layout.title')}
          subtitle={t('shell.desktop.layout.subtitle', { host: shortHost(relayUrl) })}
          onClose={onClose}
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-6">
          {/* Add category */}
          <section className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">{t('mobile.layout.newCategory')}</div>
            <div className="flex gap-2">
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
            </div>
          </section>

          {/* Categories list */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">{t('mobile.layout.categories')}</div>
              <div className="text-[11px] text-lc-muted">{t('shell.desktop.layout.grabHint')}</div>
            </div>
            {laidOut.categories.length === 0 && (
              <div className="rounded-lg border border-dashed border-lc-border p-3 text-center text-xs text-lc-muted">
                {t('shell.desktop.layout.empty')}
              </div>
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
            <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">
              {t('mobile.layout.uncategorizedCount', { count: laidOut.uncategorized.length })}
            </div>
            <div
              className="space-y-1 rounded-lg"
              onDragOver={drag.bucketDragOver}
              onDrop={drag.bucketDrop}
              data-testid="layout-uncategorized"
            >
              {laidOut.uncategorized.length === 0 ? (
                <div className="rounded border border-dashed border-lc-border px-2 py-2 text-center text-[11px] text-lc-muted">
                  {t('shell.desktop.layout.allPlaced')}
                </div>
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
