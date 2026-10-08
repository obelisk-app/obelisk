'use client';

import type { FormEvent } from 'react';
import { useSignerReady } from '@/hooks/session/useSession';

/**
 * The publications chrome's view model: whether a new publication can be
 * started, whether Enter would create one (typed text with no exact title
 * match), whether the All chip is the active one, and the search submit.
 */
export function useForumChrome(searchQuery: string, exactMatch: boolean, selectedTagIds: ReadonlyArray<string>, onSubmitSearch: () => void) {
  const ready = useSignerReady();
  return {
    ready,
    canCreate: !exactMatch && searchQuery.trim().length > 0,
    allActive: selectedTagIds.length === 0,
    isSelected: (id: string) => selectedTagIds.includes(id),
    submit: (e: FormEvent) => {
      e.preventDefault();
      onSubmitSearch();
    },
  };
}
