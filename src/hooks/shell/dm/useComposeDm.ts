'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useNostrUserSearch } from '@/hooks/identity/useNostrUserSearch';
import { recordNip05Resolution } from '@/services/identity/nip05-verify';
import { clampActiveIndex, composeDmKeyAction, mergeUserHits } from '@/utils/shell/desktop/compose-dm';

/**
 * The desktop "New message" search: the query, the merged people results,
 * the highlighted row and the keyboard (up/down to move, Enter to open, Esc
 * to close). The search box is focused on open; its ref is the component's,
 * so the view model holds no ref the markup reads during render.
 */
export function useComposeDm({ onClose, onPicked, inputRef }: {
  onClose: () => void;
  onPicked: (pubkeyHex: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { directHit, nip05Hit, nostrResults, loading } = useNostrUserSearch(query);

  // The NIP-05 hit came from the `.well-known` document itself (the reader
  // typed the handle and it resolved to this pubkey), so the pair is
  // established; record it so the row can show the badge without a second
  // request.
  useEffect(() => {
    if (nip05Hit?.nip05) recordNip05Resolution(nip05Hit.pubkey, nip05Hit.nip05);
  }, [nip05Hit]);

  useEffect(() => { inputRef.current?.focus(); }, [inputRef]);

  const results = useMemo(() => mergeUserHits(directHit, nip05Hit, nostrResults), [directHit, nip05Hit, nostrResults]);
  const selected = clampActiveIndex(active, results.length);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const action = composeDmKeyAction(e.key, selected, results.length);
    if (!action) return;
    e.preventDefault();
    if (action.kind === 'close') onClose();
    else if (action.kind === 'highlight') setActive(action.index);
    else onPicked(results[action.index].pubkey);
  };

  return {
    query,
    /** A new query starts the highlight at the top again. */
    setQuery: (value: string) => {
      setQuery(value);
      setActive(0);
    },
    results,
    loading,
    selected,
    searching: query.trim().length >= 2 || results.length > 0,
    onKeyDown,
    highlight: setActive,
    pick: onPicked,
    close: onClose,
  };
}
