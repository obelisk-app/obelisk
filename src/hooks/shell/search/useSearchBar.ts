'use client';

import { useCallback, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { useDismiss } from '@/hooks/common/useDismiss';
import type { JsSearchHit } from '@/services/nostr-bridge';
import { useRelaySearch } from '@/hooks/chat/search/useRelaySearch';
import { useChatStore } from '@/store/chat';
import { searchBarKeyAction } from '@/utils/shell/desktop/search-keys';

/**
 * The desktop search bar's view model: the shared relay search
 * (`useRelaySearch`), whether the dropdown is open, the phone-width overlay,
 * and where a picked hit or person goes. A press outside the bar (`rootRef`)
 * closes it. The two refs are the component's, so the view model holds no
 * ref the markup reads during render.
 */
export function useSearchBar({ activeGroupId, onJump, inputRef, rootRef }: {
  activeGroupId: string | null;
  onJump?: (msg: JsSearchHit) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
}) {
  const search = useRelaySearch({ activeGroupId });
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const closeAll = useCallback(() => {
    setOpen(false);
    // The mobile input is a fixed full-width overlay; leaving it expanded
    // pins it over the header with its own trigger button hidden.
    setMobileExpanded(false);
  }, []);

  useDismiss({
    refs: [rootRef],
    enabled: open || mobileExpanded,
    escape: 'ignore', // The input handles Escape to clear its query before closing.
    onDismiss: closeAll,
  });

  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());

  const jumpTo = (m: JsSearchHit) => {
    // A host may override where a hit goes; by default the shell is asked to
    // switch channel and scroll to the message. Without that fallback,
    // clicking a result only closed the dropdown.
    if (onJump) onJump(m);
    else if (m.groupId) useChatStore.getState().requestJump(m.groupId, m.id);
    search.jumpTo(m);
    closeAll();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const action = searchBarKeyAction(e.key, search.raw, search.results.length, search.activeIndex);
    if (!action) return;
    e.preventDefault();
    if (action.kind === 'clear') search.setRaw('');
    else if (action.kind === 'close') closeAll();
    else if (action.kind === 'move') search.moveActive(action.delta);
    else jumpTo(search.results[action.index]);
  };

  return {
    search,
    open,
    mobileExpanded,
    /** Nothing typed yet: the pane shows the filters and recent queries. */
    showFilters: !search.raw.trim(),
    activeDescendant: search.activeIndex >= 0 ? `search-result-${search.activeIndex}` : undefined,
    openPane: () => setOpen(true),
    closeAll,
    expandMobile: () => {
      setMobileExpanded(true);
      setOpen(true);
      focusInput();
    },
    submit: (e: FormEvent) => {
      e.preventDefault();
      search.submit();
    },
    closeAndClear: () => {
      closeAll();
      search.setRaw('');
    },
    onKeyDown,
    jumpTo,
    applyFilter: (token: string) => {
      search.applyFilter(token);
      setOpen(true);
      // Without this the caret is stranded on the button that was clicked.
      focusInput();
    },
    pickHistory: (query: string) => {
      search.setRaw(query);
      setOpen(true);
    },
    previewUser: (pubkey: string) => {
      useChatStore.getState().openProfilePopup(pubkey);
      closeAll();
    },
  };
}
