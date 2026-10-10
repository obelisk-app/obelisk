'use client';

import { useCallback, useLayoutEffect, useId, useMemo, useRef, useSyncExternalStore, type SetStateAction } from 'react';
import { useMyPubkey } from '@/hooks/session/useSession';
import { conversationDraft, draftGeneration, subscribeDraftGeneration, updateDraftField, type ConversationDraft } from '@/store/chat/composer-drafts';
import { useCurrentRelayUrl, type JsMessage } from '@/services/nostr-bridge';

export function useConversationDraft(kind: 'channel' | 'dm', conversation: string, relay = '') {
  const account = useMyPubkey();
  const anonymous = useId();
  useSyncExternalStore(subscribeDraftGeneration, draftGeneration, draftGeneration);
  return conversationDraft(JSON.stringify([account ?? anonymous, kind, relay, conversation]));
}

export function useDraftField<T>(entry: ConversationDraft, field: string, initial: T) {
  const fallback = useMemo(() => initial, []); // eslint-disable-line react-hooks/exhaustive-deps
  const subscribe = useCallback((notify: () => void) => {
    entry.listeners.add(notify);
    return () => { entry.listeners.delete(notify); };
  }, [entry]);
  const snapshot = useCallback(() => (entry.values[field] as T | undefined) ?? fallback, [entry, field, fallback]);
  const value = useSyncExternalStore(subscribe, snapshot, () => fallback);
  const setValue = useCallback((update: SetStateAction<T>) => {
    updateDraftField(entry, field, fallback, update);
  }, [entry, field, fallback]);
  return [value, setValue] as const;
}

export function useChannelReplyDraft(groupId: string) {
  const relay = useCurrentRelayUrl();
  return useDraftField<JsMessage | null>(useConversationDraft('channel', groupId, relay), 'reply', null);
}

/** A deferred send may proceed only while its originating pane is current. */
export function useDraftSendGuard(entry: ConversationDraft) {
  const current = useRef(entry);
  useLayoutEffect(() => { current.current = entry; }, [entry]);
  const mounted = useRef(true);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return () => entry.active && mounted.current && current.current === entry;
}
