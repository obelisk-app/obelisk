import { useMemo, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { type JsGroup } from '@/services/nostr-bridge';
import { type ChannelLayout } from '@/services/relay/channel-layout';
import { useChannelLayoutEditor } from '@/hooks/relay/useChannelLayoutEditor';
import { categoryLabel } from '@/utils/relay/category-label';
import { categoryOptions } from '@/utils/shell/mobile/category-options';
import { indexById } from '@/utils/shell/mobile/channel-list';

/**
 * The phone layout sheet's view model: the shared layout editor, the
 * channels by id, the category picker's options (named in the reader's
 * language), and Enter in the new-category field adding it.
 */
export function useManageCategoriesSheet(
  relayUrl: string,
  layout: ChannelLayout,
  channels: ReadonlyArray<JsGroup>,
  close: () => void,
) {
  const t = useTranslations();
  const editor = useChannelLayoutEditor(relayUrl, layout, channels, close);
  const channelsById = useMemo(() => indexById(channels), [channels]);
  const catOptions = categoryOptions(
    editor.draft.categories.map((c) => ({ id: c.id, name: categoryLabel(c.name, t) })),
    t('mobile.layout.uncategorized'),
  );
  return {
    ...editor,
    channelsById,
    catOptions,
    onNewCategoryKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      editor.addCategory();
    },
  };
}
