'use client';

import { useId } from 'react';
import { type JsGroup } from '@/services/nostr-bridge';
import { type ChannelLayout } from '@/services/relay/channel-layout';
import { useManageCategoriesSheet } from '@/hooks/shell/mobile/sheets/layout/useManageCategoriesSheet';
import { useTranslations } from 'next-intl';
import { categoryLabel } from '@/utils/relay/category-label';
import Sheet from '@/components/ui/overlays/Sheet';
import Input from '@/components/ui/forms/Input';
import { CategoryChannelsBlock } from './CategoryChannelsBlock';
import { NO_CATEGORY } from '@/utils/shell/mobile/category-options';
import { CategoryListEditor } from './CategoryListEditor';
import SheetActions from '../chrome/SheetActions';
import SheetHeader from '../chrome/SheetHeader';

// Bottom-sheet for the kind 30078 channel-layout doc - categories + their
// position, plus per-channel category assignment. Mirrors the desktop
// ManageLayoutModal but uses up/down buttons instead of drag handles since
// touch reordering on mobile is fiddly without a dedicated drag library.
export function ManageCategoriesSheet({
  relayUrl,
  layout,
  channels,
  close,
}: {
  relayUrl: string;
  layout: ChannelLayout;
  channels: ReadonlyArray<JsGroup>;
  close: () => void;
}) {
  const t = useTranslations();
  const newCatId = useId();
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
    renameCategory,
    save,
    setChannelCategory,
    draft,
    channelsById,
    catOptions,
    onNewCategoryKeyDown,
  } = useManageCategoriesSheet(relayUrl, layout, channels, close);

  return (
    <Sheet onClose={close} screen="manage-categories" label={t('mobile.layout.title')} zIndex={20} maxHeight="94%">
      <SheetHeader
        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>}
        title={t('mobile.layout.title')}
        subtitle={t('mobile.layout.help')}
      />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor={newCatId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {t('mobile.layout.newCategory')}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="setup-input-wrap" style={{ flex: 1 }}>
            <Input
              variant="mobile"
              id={newCatId}
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={onNewCategoryKeyDown}
              placeholder={t('mobile.layout.categoryPlaceholder')}
            />
          </div>
          <button
            type="button"
            onClick={addCategory}
            disabled={!newCatName.trim()}
            className="btn-primary"
            style={{ width: 'auto', padding: '0 18px', boxShadow: 'none' }}
          >
            {t('shell.rail.addModal.add')}
          </button>
        </div>
      </section>

      <CategoryListEditor
        categories={draft.categories}
        moveCategory={moveCategory}
        renameCategory={renameCategory}
        deleteCategory={deleteCategory}
      />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          {t('mobile.layout.channelsCount', { count: channels.length })}
        </label>
        {channels.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--app-text-mute)', padding: '6px 4px' }}>
            {t('mobile.space.noChannels')}
          </div>
        ) : (
          <>
            {laidOut.categories.map((cat) => (
              <CategoryChannelsBlock
                key={cat.id}
                catName={categoryLabel(cat.name, t)}
                channelIds={cat.channelIds}
                channelsById={channelsById}
                catOptions={catOptions}
                currentCatId={cat.id}
                onAssign={setChannelCategory}
                onMove={moveChannel}
              />
            ))}
            {laidOut.uncategorized.length > 0 && (
              <CategoryChannelsBlock
                catName={t('mobile.layout.uncategorized')}
                channelIds={laidOut.uncategorized}
                channelsById={channelsById}
                catOptions={catOptions}
                currentCatId={NO_CATEGORY}
                onAssign={setChannelCategory}
                onMove={moveChannel}
              />
            )}
          </>
        )}
      </section>

      {err && <div style={{ fontSize: 12, color: 'var(--presence-dnd)' }}>{err}</div>}
      <SheetActions
        primary={{ label: t('mobile.layout.publish'), busyLabel: t('common.saving'), busy: saving, onClick: () => void save(), testId: 'mobile-categories-save' }}
        onCancel={close}
      />
    </Sheet>
  );
}
