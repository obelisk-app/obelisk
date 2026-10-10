import { registerRuntimeCache } from '@/services/local-data/runtime-caches';

/** Visit-only drafts. Never serialize message text or encrypted attachment keys. */
export interface ConversationDraft {
  values: Record<string, unknown>;
  listeners: Set<() => void>;
  urls: Set<string>;
  active: boolean;
}
let generation = 0;
const subscribers = new Set<() => void>();
export function draftGeneration() { return generation; }
export function subscribeDraftGeneration(notify: () => void) {
  subscribers.add(notify);
  return () => { subscribers.delete(notify); };
}
const drafts = new Map<string, ConversationDraft>();

export function conversationDraft(key: string): ConversationDraft {
  let draft = drafts.get(key);
  if (!draft) {
    draft = { values: {}, listeners: new Set(), urls: new Set(), active: true };
    drafts.set(key, draft);
  }
  return draft;
}

export function clearConversationDrafts(): void {
  for (const draft of drafts.values()) {
    draft.active = false;
    for (const url of draft.urls) URL.revokeObjectURL(url);
    draft.urls.clear();
    draft.values = {};
    for (const notify of draft.listeners) notify();
  }
  drafts.clear();
  generation += 1;
  for (const notify of subscribers) notify();
}

registerRuntimeCache({
  id: 'conversation-drafts', category: 'channels', scope: 'account', sensitive: true,
  inspect: () => ({ entries: drafts.size }), invalidate: clearConversationDrafts,
});

export function updateDraftField<T>(entry: ConversationDraft, field: string, fallback: T, update: T | ((value: T) => T)) {
  if (!entry.active) return;
  const current = (entry.values[field] as T | undefined) ?? fallback;
  entry.values = { ...entry.values, [field]: typeof update === 'function' ? (update as (value: T) => T)(current) : update };
  for (const notify of entry.listeners) notify();
}

export function clearSubmittedDraft(entry: ConversationDraft, submitted: Record<string, unknown>) {
  if (!entry.active || entry.values !== submitted) return false;
  entry.values = {};
  for (const notify of entry.listeners) notify();
  return true;
}
