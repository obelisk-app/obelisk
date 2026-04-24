'use client';

import ModalShell from '@/components/ModalShell';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  confirmClass = 'bg-red-600 hover:bg-red-700',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ModalShell
      onClose={onCancel}
      closeOnBackdrop={false}
      panelClassName="lc-card p-6 max-w-sm w-full mx-4"
      testId="confirm-dialog"
    >
      <h3 className="text-lg font-semibold text-lc-white mb-2">{title}</h3>
      <p className="text-sm text-lc-muted mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-full text-sm text-lc-muted border border-lc-border hover:border-lc-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 rounded-full text-sm text-white font-medium transition-colors ${confirmClass}`}
          data-testid="confirm-btn"
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
