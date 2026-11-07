'use client';

import { useId, useMemo, useState, type KeyboardEvent, type RefObject } from 'react';
import { hexToNpub } from '@nostr-wot/data';
import { useNostrUserSearch } from './useNostrUserSearch';
import { useDismiss } from '@/hooks/common/useDismiss';
import { mergeUserHits } from '@/utils/identity/user-hits';

/** Shared identity selection; search text never silently selects a name match. */
export function useNostrUserPicker(value: string, onChange: (value: string) => void, excludedPubkeys: readonly string[], rootRef: RefObject<HTMLDivElement | null>) {
  const resultsId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const { directHit, nip05Hit, nostrResults, loading } = useNostrUserSearch(open ? value : '');
  const results = useMemo(() => {
    const excluded = new Set(excludedPubkeys);
    return mergeUserHits(directHit, nip05Hit, nostrResults).filter((hit) => !excluded.has(hit.pubkey));
  }, [directHit, nip05Hit, nostrResults, excludedPubkeys]);
  const selected = Math.min(active, Math.max(0, results.length - 1));
  const searching = open && value.trim().length >= 2;
  useDismiss({ refs: [rootRef], enabled: open, onDismiss: () => setOpen(false), escape: 'ignore' });

  function pick(pubkey: string) {
    onChange(hexToNpub(pubkey));
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (results.length && event.key === 'Enter') {
      event.preventDefault();
      pick(results[selected].pubkey);
    } else if (results.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setActive((selected + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    }
  }

  return {
    resultsId, results, selected, searching, loading, pick, onKeyDown,
    focus: () => setOpen(true),
    change: (next: string) => { onChange(next); setOpen(true); setActive(0); },
  };
}
