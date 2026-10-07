/**
 * The app's own confirmation prompt, in place of `window.confirm()`: the
 * request side. `<ConfirmDialogHost />` (`src/components/ui/overlays/ConfirmDialog.tsx`,
 * mounted once in the root layout) renders whatever is pending here.
 *
 * Usage keeps the one-line shape of the native call:
 *
 *   if (!(await confirmDialog({ title: t('…'), confirmLabel: t('common.confirm.delete') }))) return;
 *
 * This tiny module-level store used to live inside the component file, so
 * the one plain function that asks for confirmation (removing a relay from
 * the rail) could only reach it by importing a component.
 */

export interface ConfirmOptions {
  title: string;
  /** Optional second line: consequences, what can be undone. */
  message?: string;
  /** Defaults to the localized "Delete". */
  confirmLabel?: string;
  /** Defaults to the localized "Cancel". */
  cancelLabel?: string;
  /** `danger` (default) paints the confirm button red. */
  tone?: 'danger' | 'default';
  /** Badge above the title. Defaults to `trash` for danger, none otherwise. */
  icon?: 'trash' | 'leave' | 'none';
}

export interface PendingConfirm extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

let current: PendingConfirm | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Answer the open request (if any) and clear it. */
export function settleConfirm(ok: boolean): void {
  const pending = current;
  if (!pending) return;
  current = null;
  emit();
  pending.resolve(ok);
}

/**
 * Ask the user to confirm. Resolves `true` on confirm and `false` on cancel,
 * Escape or a backdrop click. A second request while one is open cancels the
 * first: two stacked "are you sure?" dialogs are never what anyone meant.
 * Without a mounted host (a test, a server render) it resolves `false`,
 * which is the safe answer for a destructive action.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (listeners.size === 0) return Promise.resolve(false);
  settleConfirm(false);
  return new Promise<boolean>((resolve) => {
    current = { ...options, id: nextId++, resolve };
    emit();
  });
}

/** For the host's `useSyncExternalStore`. */
export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getPendingConfirm = (): PendingConfirm | null => current;
