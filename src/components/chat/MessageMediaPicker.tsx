'use client';

/**
 * The composer's emoji / GIF / sticker picker. The emoji tab hosts
 * EmojiPicker; the other two show the reader's media, the relay's, the
 * built-in catalog (plus GIPHY when a key is set) and recents. The pieces
 * sit in `./picker/`; this file keeps the public names other folders import.
 */
import type { CustomEmojiMap } from '@/utils/media-tags/custom-emoji-tags';
import MediaLibraryModal from '@/components/media/MediaLibraryModal';
import { useTranslation } from '@/i18n/context';
import EmptyState from '@/components/ui/EmptyState';
import EmojiPicker, { MediaPickerSearch, type PickedCustomEmoji } from './EmojiPicker';
import type { MediaPickerTab } from './picker/media-catalog';
import { useMediaPicker } from '@/hooks/chat/picker/useMediaPicker';
import { CreateMediaControl } from './picker/CreateMediaControl';
import { MediaCategoryNav } from './picker/MediaCategoryNav';
import { MediaSection } from './picker/MediaSection';
import { PickerTabs } from './picker/PickerTabs';
import TextButton from '@/components/ui/TextButton';

export type { MediaPickerTab } from './picker/media-catalog';

const NO_CUSTOM_EMOJIS: CustomEmojiMap = {};

export default function MessageMediaPicker({
  onPick,
  onClose,
  variant = 'popover',
  placement = 'above',
  customEmojis = NO_CUSTOM_EMOJIS,
  initialTab = 'emoji',
}: {
  onPick: (emoji: string, custom?: PickedCustomEmoji, kind?: MediaPickerTab) => void;
  onClose: () => void;
  variant?: 'popover' | 'sheet';
  placement?: 'above' | 'below';
  customEmojis?: CustomEmojiMap;
  initialTab?: MediaPickerTab;
}) {
  const { t } = useTranslation();
  const picker = useMediaPicker({ initialTab, customEmojis, onPick });
  const { tab, setTab, category, sections, favoriteUrls, libraryOpen, setLibraryOpen } = picker;
  const isSheet = variant === 'sheet';
  const placementClass = placement === 'below' ? 'top-full mt-1' : 'bottom-full mb-1';
  // Same surfaces as every other panel: raised `lc-dark` on desktop, the
  // `lc-card` sheet surface on mobile. `--picker-surface` carries the colour
  // down to the sticky section headers and to the nested EmojiPicker.
  const shellClass = isSheet
    ? 'flex h-full w-full flex-col overflow-hidden [--picker-surface:var(--color-lc-card)] bg-[var(--picker-surface)] text-lc-white'
    : `absolute left-0 ${placementClass} z-40 flex h-[520px] max-h-[calc(100vh-1rem)] w-[600px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-lc-border [--picker-surface:var(--color-lc-dark)] bg-[var(--picker-surface)] text-lc-white shadow-2xl`;

  if (tab === "emoji") {
    return (
      <div className={shellClass} data-testid="media-picker-shell">
        <div className="min-h-0 flex-1 [&_[role=dialog]]:static [&_[role=dialog]]:h-full [&_[role=dialog]]:w-full [&_[role=dialog]]:rounded-none [&_[role=dialog]]:border-0">
          <EmojiPicker
            variant="sheet"
            showClose={false}
            customEmojis={picker.emojiMaps.customEmojis}
            customMediaKinds={picker.emojiMaps.customMediaKinds}
            columns={isSheet ? 7 : 12}
            customEmojiAction={<CreateMediaControl kind="emoji" square uploading={picker.uploading} onFile={picker.createMedia} />}
            onPick={onPick}
            onClose={onClose}
          >
            <PickerTabs tab={tab} onTab={setTab} />
          </EmojiPicker>
        </div>
        {libraryOpen && <MediaLibraryModal onClose={() => setLibraryOpen(null)} initialTab={libraryOpen} initialKind="emoji" />}
      </div>
    );
  }

  const tileHandlers = {
    onPick: picker.pickMedia,
    favoriteUrls,
    onFavorite: picker.favoriteMedia,
    onMediaLoad: picker.classifyEntry,
    onMediaError: picker.markBroken,
  };

  return (
    <div className={shellClass} data-testid="media-picker-shell">
      <div role="dialog" aria-label={t('mediaPicker.title')} className="flex h-full w-full flex-col overflow-hidden p-2 text-lc-white" onClick={(event) => event.stopPropagation()}>
      <MediaCategoryNav category={category} onCategory={picker.chooseCategory} />
      <div className="my-2 flex items-center gap-2">
        <MediaPickerSearch
          value={picker.query}
          onChange={picker.setQuery}
          placeholder={tab === "gif" ? "Search GIFs" : "Search stickers"}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1" data-testid="media-grid">
        {category === 'Recent' ? (
          <MediaSection title={tab === 'gif' ? 'Recent GIFs' : 'Recent stickers'} entries={sections.recentVisible} {...tileHandlers} />
        ) : (
          <>
            {(tab === "sticker" || tab === "gif" || sections.personalVisible.length > 0) && (
              <MediaSection title={tab === 'gif' ? 'My GIFs' : 'My stickers'} entries={sections.personalVisible} {...tileHandlers}>
                <CreateMediaControl kind={tab} uploading={picker.uploading} onFile={picker.createMedia} />
              </MediaSection>
            )}
            <MediaSection title={tab === 'gif' ? 'Default GIFs' : 'Default stickers'} entries={sections.defaultVisible} {...tileHandlers} />
            {sections.serverVisible.length > 0 && (
              <MediaSection title={tab === 'gif' ? 'Server GIFs' : 'Server stickers'} entries={sections.serverVisible} {...tileHandlers} />
            )}
          </>
        )}
        {category === 'Recent' && sections.recentVisible.length === 0 && (
          <EmptyState padding="none" className="py-12">No recent {tab === 'gif' ? 'GIFs' : 'stickers'}</EmptyState>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 pb-1">
        <TextButton onClick={() => setLibraryOpen("mine")} className="text-xs font-medium" data-testid="manage-media-packs">
          {t('mediaPicker.favorites')}
        </TextButton>
        <span className="text-right text-[10px] text-lc-muted">{tab === 'gif' ? 'Powered by GIPHY' : 'Stickers by Twemoji'}</span>
      </div>
      <PickerTabs tab={tab} onTab={setTab} />
      {libraryOpen && <MediaLibraryModal onClose={() => setLibraryOpen(null)} initialTab={libraryOpen} initialKind={tab} />}
      </div>
    </div>
  );
}
