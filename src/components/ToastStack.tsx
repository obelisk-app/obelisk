'use client';

import { useEffect } from 'react';
import { useToastStore } from '@/store/toast';

const AUTO_DISMISS_MS = 5000;

export default function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => {
      const remaining = Math.max(0, AUTO_DISMISS_MS - (Date.now() - t.createdAt));
      return window.setTimeout(() => dismissToast(t.id), remaining);
    });
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] sm:w-96"
      data-testid="toast-stack"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            t.onClick?.();
            dismissToast(t.id);
          }}
          className="lc-card text-left px-4 py-3 shadow-lg border border-lc-border hover:border-lc-green/50 transition-colors cursor-pointer group"
          data-testid="toast"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-lc-white truncate">{t.title}</div>
              <div className="text-sm text-lc-muted mt-0.5 line-clamp-2 break-words">{t.body}</div>
            </div>
            <span
              role="button"
              aria-label="Dismiss"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                dismissToast(t.id);
              }}
              className="text-lc-muted hover:text-lc-white shrink-0 text-lg leading-none"
              data-testid="toast-dismiss"
            >
              ×
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
