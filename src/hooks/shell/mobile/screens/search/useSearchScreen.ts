import { useRef, type KeyboardEvent } from 'react';
import { type JsGroup, type JsSearchHit } from '@/services/nostr-bridge';
import { isEmptyQuery } from '@/utils/chat/search/search-query';
import { useRelaySearch } from '@/hooks/chat/search/useRelaySearch';

/**
 * The phone search screen over the shared `useRelaySearch`: chips that
 * insert grammar and hand the focus back, Escape that clears and then
 * leaves, and opening a message result in its channel.
 */
export function useSearchScreen({ back, selectGroup }: {
  back: () => void;
  selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
}) {
  const search = useRelaySearch();
  const inputRef = useRef<HTMLInputElement>(null);
  const showChannels = search.channelMatches.length > 0;
  return {
    search,
    inputRef,
    empty: isEmptyQuery(search.parsed),
    showChannels,
    nothingAtAll: !search.busy && !search.error && search.results.length === 0 && !showChannels,
    addToken: (token: string) => {
      search.applyFilter(token);
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    openHit: (h: JsSearchHit) => {
      if (!h.groupId) return;
      search.jumpTo(h);
      selectGroup(h.groupId, search.groupById.get(h.groupId)?.kind ?? 'text');
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (search.raw) search.setRaw('');
      else back();
    },
  };
}
