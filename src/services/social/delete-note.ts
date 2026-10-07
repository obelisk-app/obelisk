import type { Event as NostrEvent } from 'nostr-tools';
import { publishDelete } from '@/services/social/publish';
import { useToastStore } from '@/store/feedback/toast';
import type { Translate } from '@/i18n/keys';

/**
 * Ask the relays to delete one of your notes (NIP-09), then say how it
 * went. `onDeleted` runs only when the request was published, so a host can
 * drop the note from view without hiding one that is still out there.
 */
export async function deleteNoteWithToast(note: NostrEvent, t: Translate, onDeleted?: () => void): Promise<void> {
  const toast = (title: string) => useToastStore.getState().pushToast({ title, body: '' });
  try {
    await publishDelete(note);
    toast(t('social.deleteRequested'));
    onDeleted?.();
  } catch {
    toast(t('social.actionFailed'));
  }
}
