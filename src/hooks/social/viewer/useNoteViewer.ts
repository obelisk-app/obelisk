'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import type { Event as NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { fetchNote } from '@nostr-wot/data';
import { initSocial, querySocial } from '@/services/social/pool';
import { DEFAULT_SOCIAL_RELAYS } from '@/constants/social/relays';
import { renderModeFor } from '@/services/social/kinds';
import { KIND_TEXT_NOTE } from '@/constants/nostr/nip-kinds';
import { getPreferences } from '@/services/preferences/preferences';
import type { ViewerTarget } from '@/services/social/identifier';
import { localizedPath } from '@/utils/seo/alternates';

export type NoteViewerState = 'loading' | 'ready' | 'missing';

/**
 * Look for a note the server's bounded query missed: on the link's relays
 * and the feed relays (the defaults for a visitor who never opened the app).
 * Resolves to the note, or null when the relays do not have it (or the
 * target is a profile, which is not a note).
 */
async function loadNote(target: ViewerTarget): Promise<NostrEvent | null> {
  const configured = getPreferences().socialRelays;
  const relays = [...new Set([
    ...target.relays,
    ...(configured.length ? configured : DEFAULT_SOCIAL_RELAYS),
  ])];
  initSocial(relays);

  if (target.kind === 'address') {
    const events = await querySocial([{
      kinds: [target.eventKind],
      authors: [target.pubkey],
      '#d': [target.identifier],
      limit: 1,
    }], { relays });
    return events.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
  }

  if (target.kind === 'profile') return null;

  const entry = await fetchNote(target.id, relays);
  if (!entry) return null;
  return {
    id: entry.id,
    pubkey: entry.pubkey,
    content: entry.content,
    created_at: entry.createdAt,
    tags: entry.tags,
    kind: KIND_TEXT_NOTE,
    sig: '',
  };
}

/**
 * The public note viewer's client island (`src/app/[locale]/notes/[id]/NoteViewerClient.tsx`):
 * the note the server found, or the one fetched here when the server came
 * up empty (slow relays rather than a missing note), whether it reads as an
 * article, and the author link.
 */
export function useNoteViewer({ target, initialNote }: { target: ViewerTarget | null; initialNote: NostrEvent | null }) {
  const locale = useLocale();
  const [note, setNote] = useState<NostrEvent | null>(initialNote);
  const [state, setState] = useState<NoteViewerState>(
    initialNote ? 'ready' : target ? 'loading' : 'missing',
  );

  useEffect(() => {
    // Server already found it, or there was nothing to look for.
    if (initialNote || !target) return;
    let cancelled = false;
    loadNote(target)
      .then((found) => {
        if (cancelled) return;
        setNote(found);
        setState(found ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setState('missing');
      });
    return () => { cancelled = true; };
  }, [target, initialNote]);

  return {
    state,
    note,
    isArticle: note ? renderModeFor(note.kind) === 'article' : false,
    /**
     * The reader's author button: this page has no in-app profile pane, so
     * it goes to the public profile viewer. A full page load between two
     * public viewers on purpose: `router.push` would make it client-side,
     * and the profile viewer is server-rendered for its link preview.
     */
    openProfile: (pubkey: string) => {
      try {
        window.location.assign(localizedPath(locale, `/p/${nip19.npubEncode(pubkey)}`));
      } catch {
        window.location.assign(localizedPath(locale, `/p/${pubkey}`));
      }
    },
  };
}
