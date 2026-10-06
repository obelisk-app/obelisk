'use client';

import { useMemo } from 'react';
import { type JsGroup } from '@/services/nostr-bridge';
import { shortHost } from '@/utils/relay-url/url-host';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import ModalHeader from '@/components/ui/ModalHeader';
import { type ChannelLayout } from '@/services/channel-layout';
import { useChannelLayoutEditor } from '@/hooks/useChannelLayoutEditor';
import { useTranslation } from '@/i18n/context';
import { ChannelOrderRow } from './layout/ChannelOrderRow';
import { LayoutCategoryCard } from './layout/LayoutCategoryCard';
import { useLayoutDrag } from './layout/useLayoutDrag';

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
  const { t } = useTranslation();
  const {
    error: err,
    laidOut,
    newCategoryName: newCatName,
    saving,
    setNewCategoryName: setNewCatName,
    addCategory,
    deleteCategory,
    moveCategory,
    moveChannel,
    placeCategory,
    placeChannel,
    renameCategory,
    save,
    setChannelCategory,
  } = useChannelLayoutEditor(relayUrl, layout, channels, onClose);
  const channelsById = useMemo(
    () => Object.fromEntries(channels.map((group) => [group.id, group])),
    [channels],
  );
  const drag = useLayoutDrag({ placeCategory, placeChannel });

  return (
    <Modal
      onClose={onClose}
      panelClassName="lc-card flex max-h-[90vh] w-full max-w-2xl mx-4 flex-col overflow-hidden bg-lc-dark"
    >
        <ModalHeader
          title={t('mobile.layout.title')}
          subtitle={<>Shared layout for {shortHost(relayUrl)} · operator only · NIP-78 kind 30078</>}
          onClose={onClose}
        />
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Add category */}
          <section className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">{t('mobile.layout.newCategory')}</div>
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                placeholder={t('mobile.layout.categoryPlaceholder')}
                size="sm"
                className="flex-1"
              />
              <Button onClick={addCategory} disabled={!newCatName.trim()} className="shrink-0">
                {t('rail.addModal.add')}
              </Button>
            </div>
          </section>

          {/* Categories list */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">{t('mobile.layout.categories')}</div>
              <div className="text-[11px] text-lc-muted">{t('desktop.layout.grabHint')}</div>
            </div>
            {laidOut.categories.length === 0 && (
              <div className="rounded-lg border border-dashed border-lc-border p-3 text-center text-xs text-lc-muted">
                {t('desktop.layout.empty')}
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
                renameCategory={renameCategory}
                moveCategory={moveCategory}
                deleteCategory={deleteCategory}
                moveChannel={moveChannel}
                setChannelCategory={setChannelCategory}
              />
            ))}
          </section>

          {/* Uncategorized channels */}
          <section className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-lc-muted">
              Uncategorized · {laidOut.uncategorized.length}
            </div>
            <div
              className="space-y-1 rounded-lg"
              onDragOver={(event) => { if (drag.dragged?.type === 'channel') event.preventDefault(); }}
              onDrop={(event) => {
                if (drag.dropOnUncategorized()) event.preventDefault();
              }}
              data-testid="layout-uncategorized"
            >
              {laidOut.uncategorized.length === 0 ? (
                <div className="rounded border border-dashed border-lc-border px-2 py-2 text-center text-[11px] text-lc-muted">
                  {t('desktop.layout.allPlaced')}
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
                    onMove={(d) => moveChannel(id, d)}
                    onChangeCategory={(catId) => setChannelCategory(id, catId)}
                    onGrab={() => drag.grabChannel(id)}
                    onDragEnd={drag.endDrag}
                    onDropBefore={() => drag.dropBefore(null, id)}
                  />
                ))
              )}
            </div>
          </section>

          {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-lc-border bg-lc-dark px-5 py-3">
          <div className="text-[11px] text-lc-muted">
            {t('desktop.layout.saveHelp')}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="md" onClick={onClose} className="rounded-lg font-medium">
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Publishing…' : 'Publish layout'}
            </Button>
          </div>
        </footer>
    </Modal>
  );
}
