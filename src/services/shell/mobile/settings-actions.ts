/** What the phone preferences screen does beyond reading and writing a preference. */
import { nostrActions } from '@/services/nostr-bridge';
import { useHintsStore } from '@/store/hints';
import { useToastStore } from '@/store/feedback/toast';

/** The hints are one-shot, so this is the only way back to them: reset them all, then say so. */
export function replayHints(toastTitle: string): void {
  useHintsStore.getState().resetHints();
  useToastStore.getState().pushToast({ title: toastTitle, body: '' });
}

/** Sign out of this device (the confirmation sheet has already been answered). */
export function disconnect(): void {
  void nostrActions.logout();
}
