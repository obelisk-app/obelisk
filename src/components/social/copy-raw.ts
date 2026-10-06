import type { Event as NostrEvent } from 'nostr-tools';
import { rawEventJson } from '@/services/social/note-links';
import { useToastStore } from '@/store/toast';

/** Copy a note's raw event JSON and say so. */
export function copyRaw(note: NostrEvent, message: string): void {
  navigator.clipboard?.writeText(rawEventJson(note)).catch(() => {});
  useToastStore.getState().pushToast({ title: message, body: '' });
}
