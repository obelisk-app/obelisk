'use client';

import { useMemo, type KeyboardEvent } from 'react';
import type { JsGroup } from '@/services/nostr-bridge';
import type { ChannelLayout } from '@/services/relay/channel-layout';
import { useChannelLayoutEditor } from '@/hooks/relay/useChannelLayoutEditor';
import { useLayoutDrag } from '@/hooks/shell/modals/layout/useLayoutDrag';

/**
 * The desktop layout editor's view model: the draft layout and its edits
 * (`useChannelLayoutEditor`), drag and drop (`useLayoutDrag`) and the
 * channels by id for the rows.
 */
export function useManageLayoutModal(
  relayUrl: string,
  layout: ChannelLayout,
  channels: ReadonlyArray<JsGroup>,
  onClose: () => void,
) {
  const editor = useChannelLayoutEditor(relayUrl, layout, channels, onClose);
  const channelsById = useMemo(
    () => Object.fromEntries(channels.map((group) => [group.id, group])),
    [channels],
  );
  const drag = useLayoutDrag({ placeCategory: editor.placeCategory, placeChannel: editor.placeChannel });
  return {
    ...editor,
    channelsById,
    drag,
    canAddCategory: !!editor.newCategoryName.trim(),
    /** Enter in the new-category field adds it. */
    onNewCategoryKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      editor.addCategory();
    },
  };
}
