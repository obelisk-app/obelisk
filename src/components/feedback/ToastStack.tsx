'use client';

import { useTranslations } from 'next-intl';
import { CloseIcon } from '@/components/ui/icons/icons';
import { useToastStack } from '@/hooks/feedback/useToastStack';

/** The toasts at the top right; each closes on its own after five seconds. */
export default function ToastStack() {
  const t = useTranslations();
  const vm = useToastStack();

  if (vm.toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-96"
      data-testid="toast-stack"
    >
      {vm.toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => vm.open(toast)}
          className="lc-card text-left px-4 py-3 shadow-lg border border-lc-border hover:border-lc-green/50 transition-colors cursor-pointer group"
          data-testid="toast"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-lc-white truncate">{toast.title}</div>
              <div className="text-sm text-lc-muted mt-0.5 line-clamp-2 break-words">{toast.body}</div>
            </div>
            <span
              role="button"
              aria-label={t('common.dismiss')}
              tabIndex={-1}
              onClick={(e) => vm.dismiss(e, toast.id)}
              className="text-lc-muted hover:text-lc-white shrink-0"
              data-testid="toast-dismiss"
            >
              <CloseIcon size={16} />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
