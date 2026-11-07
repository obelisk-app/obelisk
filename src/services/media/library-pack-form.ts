import type { EditablePack } from '@/types/media/library';
import type { FormSpec } from '@/types/common/form';
import { isValidCustomEmojiName, normalizeCustomEmojiName } from '@/utils/media/tags/custom-emoji-tags';
import { isHttpUrl } from '@/utils/url/http-url';
import { mergePackItems } from '@/utils/media/library/pack-utils';

/** The editor validates the whole draft before any signing operation. */
export function libraryPackForm(pack: EditablePack, publish: (draft: EditablePack) => Promise<void>, onSaved: (draft: EditablePack) => Promise<void>): FormSpec<EditablePack, EditablePack> {
  return {
    initial: pack,
    validate: (draft) => {
      if (!draft.title.trim()) return 'media.error.nameRequired';
      const names = new Set<string>();
      const urls = new Set<string>();
      for (const item of draft.items) {
        const name = normalizeCustomEmojiName(item.name);
        if (!isValidCustomEmojiName(name) || !isHttpUrl(item.url)) return 'media.error.invalidItems';
        const url = new URL(item.url).href;
        if (urls.has(url)) return 'media.manage.assetDuplicate';
        urls.add(url);
        if (names.has(name)) return 'media.manage.nameConflict';
        names.add(name);
      }
      return null;
    },
    submit: async (draft) => {
      const saved = { ...draft, title: draft.title.trim(), items: mergePackItems([], draft.items) };
      await publish(saved);
      await onSaved(saved);
      return saved;
    },
    failure: 'media.error.savePack',
  };
}
