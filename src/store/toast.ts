import { create } from 'zustand';

export interface Toast {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  onClick?: () => void;
}

interface ToastState {
  toasts: Toast[];
  pushToast: (input: { title: string; body: string; onClick?: () => void }) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

const MAX_TOASTS = 4;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  pushToast: ({ title, body, onClick }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      toasts: [...state.toasts, { id, title, body, createdAt: Date.now(), onClick }].slice(-MAX_TOASTS),
    }));
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}));

/**
 * Convenience for the common error-toast pattern:
 *   `alert(data.error || 'fallback message')` → `pushErrorToast('fallback message', data.error)`
 * Same resolution order; surfaces as a toast instead of a blocking alert.
 */
export function pushErrorToast(fallback: string, serverMessage?: string | null, title = 'Error') {
  useToastStore.getState().pushToast({ title, body: serverMessage || fallback });
}
