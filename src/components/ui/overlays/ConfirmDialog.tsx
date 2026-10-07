'use client';

/**
 * The app's own confirmation dialog, in place of `window.confirm()`.
 *
 * The native dialog can't be styled, reads as a browser warning rather than
 * part of Obelisk, ignores the app's language (its buttons follow the OS),
 * and is suppressed outright in some embedded webviews, where `confirm()`
 * returns `false` and the action silently does nothing.
 *
 * Callers ask through `confirmDialog` in `src/services/common/confirm-dialog.ts`;
 * `<ConfirmDialogHost />` is mounted once in the root layout and renders
 * whatever request is pending there (`ConfirmDialogPanel`), so any code path
 * (a component, a hook, a plain function) can ask without owning modal state.
 */
import { useConfirmDialogHost } from '@/hooks/common/useConfirmDialogHost';
import ConfirmDialogPanel from './ConfirmDialogPanel';

export function ConfirmDialogHost() {
  const pending = useConfirmDialogHost();
  if (!pending) return null;
  return <ConfirmDialogPanel key={pending.id} pending={pending} />;
}
