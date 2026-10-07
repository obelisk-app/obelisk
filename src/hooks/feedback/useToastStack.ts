import { useEffect, type MouseEvent } from 'react';
import { useToastStore, type Toast } from '@/store/feedback/toast';
import { toastRemainingMs } from '@/utils/feedback/toast';

/**
 * The toast stack's view model: the toasts, each dismissed on its own
 * timer; a click on a toast runs its action and closes it, a click on its
 * close icon only closes it (docs/conventions.md#component-files).
 */
export function useToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => dismissToast(toast.id), toastRemainingMs(toast.createdAt, Date.now())));
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [toasts, dismissToast]);

  return {
    toasts,
    open: (toast: Toast) => {
      toast.onClick?.();
      dismissToast(toast.id);
    },
    dismiss: (event: MouseEvent, id: Toast['id']) => {
      event.stopPropagation();
      dismissToast(id);
    },
  };
}
