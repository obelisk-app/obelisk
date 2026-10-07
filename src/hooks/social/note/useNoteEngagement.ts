'use client';

import { useEffect, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import {
  getCounts,
  subscribeCounts,
  bumpCounts,
  type NoteCounts,
} from '@/services/social/engagement';
import { publishReaction, publishRepost } from '@/services/social/publish';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { noteShareUrl } from '@/services/social/note-links';
import { useToastStore } from '@/store/feedback/toast';

/**
 * The live counts under one note and the three actions that move them:
 * react, repost, share. `busy` is shared between react and repost so a
 * double tap cannot publish both at once.
 */
export interface NoteEngagement {
  counts: NoteCounts;
  busy: boolean;
  reacted: boolean;
  reposted: boolean;
  share: () => Promise<void>;
  react: () => Promise<void>;
  repost: () => Promise<void>;
}

export function useNoteEngagement(note: NostrEvent, canInteract: boolean): NoteEngagement {
  const t = useTranslations();
  const relays = usePreferences().socialRelays;
  const [counts, setCounts] = useState<NoteCounts>(() => getCounts(note.id));
  const [busy, setBusy] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [reposted, setReposted] = useState(false);

  useEffect(() => subscribeCounts(note.id, setCounts), [note.id]);

  // Native share sheet where available, clipboard otherwise: both end with
  // an Obelisk URL, never a third-party viewer.
  const share = async () => {
    const url = noteShareUrl(note, relays);
    try {
      if (navigator.share) await navigator.share({ url });
      else await navigator.clipboard?.writeText(url);
      useToastStore.getState().pushToast({ title: t('social.linkCopied'), body: '' });
    } catch {
      // Share sheet dismissed: not an error worth surfacing.
    }
  };

  const react = async () => {
    if (!canInteract || busy || reacted) return;
    setBusy(true);
    try {
      // "+": NIP-25 says an emoji is explicitly NOT a like, so a heart
      // would undercount this note in every other client.
      await publishReaction(note);
      setReacted(true);
      bumpCounts(note.id, { reactionCount: 1 });
    } catch {
      useToastStore.getState().pushToast({ title: t('social.actionFailed'), body: '' });
    } finally {
      setBusy(false);
    }
  };

  const repost = async () => {
    if (!canInteract || busy || reposted) return;
    setBusy(true);
    try {
      await publishRepost(note);
      setReposted(true);
      bumpCounts(note.id, { repostCount: 1 });
    } catch {
      useToastStore.getState().pushToast({ title: t('social.actionFailed'), body: '' });
    } finally {
      setBusy(false);
    }
  };

  return { counts, busy, reacted, reposted, share, react, repost };
}
