'use client';

import { useTranslation } from '@/i18n/context';
import Sheet from '@/components/ui/Sheet';
import SheetActions from './SheetActions';

export function DisconnectConfirmSheet({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet onClose={onCancel} screen="disconnect-confirm" label={t('mobile.settings.disconnectTitle')}>
      <div className="confirm-sheet-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </div>
      <div className="confirm-sheet-title">{t('mobile.settings.disconnectTitle')}</div>
      <div className="confirm-sheet-desc">
        {t('mobile.settings.disconnectDescription')}
      </div>
      <button className="settings-btn-danger" onClick={onConfirm} data-testid="disconnect-confirm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        {t('mobile.settings.disconnectConfirm')}
      </button>
      <SheetActions onCancel={onCancel} />
    </Sheet>
  );
}
