'use client';

import { useState, type FormEvent } from 'react';
import { nostrActions, useMyPubkey, useSignerReady } from '@/services/nostr-bridge';
import { emojiTagsForContent } from '@/utils/media/tags/custom-emoji-tags';
import { useChatStore } from '@/store/chat';
import { useTranslations } from 'next-intl';
import { errorText } from '@/utils/errors/error-text';
import { MAX_THREAD_TAGS } from '@/constants/chat/forum';

export interface NewThreadAccess {
  readonly isPublic: boolean;
  readonly isHidden: boolean;
  readonly isRestricted: boolean;
  readonly isOpen: boolean;
}

export interface NewThreadForm {
  readonly title: string;
  readonly body: string;
  readonly selectedTagIds: ReadonlyArray<string>;
  readonly submitting: boolean;
  readonly error: string | null;
  /** Signer ready and both fields filled: whether submit is allowed. */
  readonly canSubmit: boolean;
  readonly setTitle: (value: string) => void;
  readonly setBody: (value: string) => void;
  readonly toggleTag: (id: string) => void;
  readonly submit: (event?: FormEvent) => Promise<void>;
}

/**
 * Creating a publication inside a forum, headless. Creates the child NIP-29
 * group pinned to the forum via `parent`, stamped with the chosen topic ids
 * and inheriting the forum's access flags, then posts the OP body as its
 * first kind 9 (the forum hides empty threads, so this is the moment the
 * thread appears). The OP carries custom-emoji tags so `:shortcode:` in
 * the body renders as the emoji; the desktop modal used to skip them.
 */
export function useNewThreadForm(
  forumGroupId: string,
  access: NewThreadAccess,
  initialTitle: string,
  onCreated: (childId: string) => void,
): NewThreadForm {
  const t = useTranslations();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<ReadonlyArray<string>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = useSignerReady();
  const myPubkey = useMyPubkey();
  const serverEmojis = useChatStore((s) => s.serverEmojis);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_THREAD_TAGS) return prev;
      return [...prev, id];
    });
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!title.trim() || !body.trim() || submitting || !myPubkey) return;
    setSubmitting(true);
    setError(null);
    try {
      const childId = await nostrActions.createGroup({
        name: title.trim(),
        about: undefined,
        isPublic: access.isPublic,
        isHidden: access.isHidden,
        isRestricted: access.isRestricted,
        isOpen: access.isOpen,
        parent: forumGroupId,
        topics: selectedTagIds,
      });
      const text = body.trim();
      await nostrActions.sendMessage(childId, text, null, emojiTagsForContent(text, serverEmojis));
      onCreated(childId);
    } catch (err) {
      setError(errorText(t, err, 'chat.forum.createFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return {
    title, body, selectedTagIds, submitting, error,
    canSubmit: ready && !submitting && !!title.trim() && !!body.trim(),
    setTitle, setBody, toggleTag, submit,
  };
}
