'use client';

import { useState } from 'react';

interface BanReasonDialogProps {
  memberName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export default function BanReasonDialog({ memberName, onConfirm, onCancel }: BanReasonDialogProps) {
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" data-testid="ban-reason-dialog">
      <div className="bg-lc-dark border border-lc-border rounded-xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-lg font-semibold text-lc-white mb-2">Ban Member</h3>
        <p className="text-sm text-lc-muted mb-4">
          Ban {memberName}? They will be removed and cannot rejoin.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none resize-none"
          rows={3}
          data-testid="ban-reason-input"
        />
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full text-sm text-lc-muted hover:text-lc-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            className="px-4 py-2 rounded-full text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
            data-testid="ban-confirm-btn"
          >
            Ban
          </button>
        </div>
      </div>
    </div>
  );
}
