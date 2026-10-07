'use client';

import { useCallback, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useHistoryDismiss } from '@/hooks/common/useHistoryDismiss';

/**
 * The reader pane beside the desktop surface: a thread stack or one
 * long-form article, optionally full-screen, closable with the OS back
 * gesture one level at a time.
 *
 * Call it above the shell's `!isLoggedIn` early return (it holds hooks).
 */
export function useReaderPane() {
  // Threads open beside the feed on desktop rather than in a modal, a modal
  // hides the list you were reading, which is exactly the context you need
  // while following a conversation.
  /*
   * A stack, not a single id. Opening a note from inside a thread used to
   * overwrite the one you were reading, so back had nowhere to return to
   * and closed the whole pane, three taps into a conversation, one tap
   * back, and you were in the feed with your place lost.
   */
  const [threadStack, setThreadStack] = useState<string[]>([]);
  const threadNoteId = threadStack.length > 0 ? threadStack[threadStack.length - 1] : null;
  /**
   * Long-form shares the thread pane rather than opening a third one. Both
   * are "the thing you clicked, beside the list you clicked it from", and
   * two panes of reading material side by side is one too many.
   */
  const [paneArticle, setPaneArticle] = useState<NostrEvent | null>(null);
  /** Threads and articles can take the whole surface, like the feed can. */
  const [paneFull, setPaneFull] = useState(false);
  /** Open a thread fresh, from the feed, a mention, a search result. */
  const openThread = useCallback((id: string) => {
    setPaneArticle(null);
    setThreadStack([id]);
  }, []);
  /** Follow a note *from inside* a thread, keeping the way back. */
  const pushThread = useCallback((id: string) => {
    setThreadStack((stack) => (
      stack[stack.length - 1] === id ? stack : [...stack, id]
    ));
  }, []);
  /** One pane holds one thing: opening an article clears the thread stack. */
  const openArticle = useCallback((note: NostrEvent) => {
    setThreadStack([]); setPaneArticle(note);
  }, []);

  const paneOpen = !!(threadNoteId || paneArticle);
  /**
   * One history entry per thread level, so the OS back gesture pops the
   * stack the same way the header button does. An article is a single
   * level, it has no stack of its own.
   */
  const paneDepth = paneArticle ? 1 : threadStack.length;
  /*
   * Back: up one thread, or out of the pane when there is no up.
   *
   * `useHistoryDismiss` keeps the latest callback in its own ref and its
   * history effect depends only on the depth, so a new identity per level
   * costs nothing; the depth can be read as state.
   */
  const threadDepth = threadStack.length;
  const closePane = useCallback(() => {
    if (threadDepth > 1) {
      setThreadStack((stack) => stack.slice(0, -1));
      return;
    }
    setThreadStack([]);
    setPaneArticle(null);
    setPaneFull(false);
  }, [threadDepth]);
  // Back / swipe-back closes the reader rather than leaving the app.
  //
  // Above the `!isLoggedIn` early return, and it has to stay there: this is
  // a hook, and the logged-out branch returns before it. Calling it below
  // meant logging in rendered one more hook than the previous render, which
  // React refuses (#310), the chat surface hit its error boundary the
  // moment the gate flipped.
  const dismissPane = useHistoryDismiss(paneDepth, closePane);

  return {
    threadNoteId,
    paneArticle,
    paneFull,
    setPaneFull,
    paneOpen,
    openThread,
    pushThread,
    openArticle,
    dismissPane,
  };
}

/** The profile explorer pane: whose profile, full-screen or not, back closes it. */
export function useExploredProfile() {
  const [exploredProfilePubkey, setExploredProfilePubkey] = useState<string | null>(null);
  const [profileFull, setProfileFull] = useState(false);
  const closeProfile = useCallback(() => {
    setExploredProfilePubkey(null);
    setProfileFull(false);
  }, []);
  // Back closes the profile too, for the same reason it closes the reader.
  const dismissProfile = useHistoryDismiss(!!exploredProfilePubkey, closeProfile);
  return {
    exploredProfilePubkey,
    setExploredProfilePubkey,
    profileFull,
    setProfileFull,
    closeProfile,
    dismissProfile,
  };
}
