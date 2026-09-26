'use client';

/**
 * The app's own confirmation dialog, in place of `window.confirm()`.
 *
 * The native dialog can't be styled, reads as a browser warning rather than
 * part of Obelisk, ignores the app's language (its buttons follow the OS),
 * and is suppressed outright in some embedded webviews — where `confirm()`
 * returns `false` and the action silently does nothing.
 *
 * Usage keeps the one-line shape of the native call:
 *
 *   if (!(await confirmDialog({ title: t('…'), confirmLabel: t('confirm.delete') }))) return;
 *
 * `<ConfirmDialogHost />` is mounted once in the root layout; `confirmDialog`
 * talks to it through a tiny module-level store, so any code path — a
 * component, a hook, a plain function — can ask without owning modal state.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import ModalShell from '@/components/ModalShell';
import { useTranslation } from '@/i18n/context';
import { LogOutIcon, TrashIcon } from './icons';

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

interface Pending extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

let current: Pending | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function settle(ok: boolean): void {
  const pending = current;
  if (!pending) return;
  current = null;
  emit();
  pending.resolve(ok);
}

/**
 * Ask the user to confirm. Resolves `true` on confirm and `false` on cancel,
 * Escape or a backdrop click. A second request while one is open cancels the
 * first — two stacked "are you sure?" dialogs are never what anyone meant.
 * Without a mounted host (a test, a server render) it resolves `false`,
 * which is the safe answer for a destructive action.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (listeners.size === 0) return Promise.resolve(false);
  settle(false);
  return new Promise<boolean>((resolve) => {
    current = { ...options, id: nextId++, resolve };
    emit();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

export function ConfirmDialogHost() {
  const pending = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // An unmounting host (route change, logout) must not leave a caller
  // awaiting forever.
  useEffect(() => () => settle(false), []);
  if (!pending) return null;
  return <ConfirmDialogPanel key={pending.id} pending={pending} />;
}

function ConfirmDialogPanel({ pending }: { pending: Pending }) {
  const { t } = useTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const tone = pending.tone ?? 'danger';
  const icon = pending.icon ?? (tone === 'danger' ? 'trash' : 'none');
  const titleId = `confirm-dialog-title-${pending.id}`;
  const messageId = `confirm-dialog-message-${pending.id}`;

  // Focus lands on Cancel, not on the destructive button: an Enter pressed
  // out of habit should not delete anything. Focus goes back to whatever
  // opened the dialog when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  return (
    <ModalShell
      onClose={() => settle(false)}
      testId="confirm-dialog"
      panelClassName="w-full max-w-sm mx-4 rounded-2xl bg-lc-dark border border-lc-border p-6 shadow-xl"
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={pending.message ? messageId : undefined}>
        {icon !== 'none' && (
          <div
            className={
              'mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full '
              + (tone === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-lc-green/10 text-lc-green')
            }
            aria-hidden="true"
          >
            {icon === 'trash' ? <TrashIcon size={22} /> : <LogOutIcon size={22} />}
          </div>
        )}
        <h2 id={titleId} className="text-center text-lg font-semibold text-lc-white break-words">
          {pending.title}
        </h2>
        {pending.message && (
          <p id={messageId} className="mt-2 text-center text-sm text-lc-muted whitespace-pre-line break-words">
            {pending.message}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => settle(false)}
            className="rounded-full border border-lc-border bg-lc-card/60 px-4 py-2 text-sm font-medium text-lc-white transition hover:bg-lc-border/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60"
            data-testid="confirm-dialog-cancel"
          >
            {pending.cancelLabel ?? t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className={
              'rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 '
              + (tone === 'danger'
                ? 'bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-400/70'
                : 'bg-lc-green text-lc-black hover:brightness-110 focus-visible:ring-lc-green/60')
            }
            data-testid="confirm-dialog-confirm"
          >
            {pending.confirmLabel ?? t('confirm.delete')}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
