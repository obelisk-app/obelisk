'use client';

import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useTranslation } from '@/i18n/context';
import { useClearLocalData } from '@/hooks/app/settings/useClearLocalData';

/** The "clear local data" row and its confirmation. */
export function LocalDataSection() {
  const { t } = useTranslation();
  const { confirming, setConfirming, clearing, onConfirm } = useClearLocalData();

  return (
    <div className="pt-2 border-t border-lc-border">
      <div className="text-xs uppercase tracking-wider text-lc-muted font-semibold pt-2 pb-2">
        {t('preferences.localData.title')}
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-lc-white">{t('preferences.localData.clear.title')}</div>
          <div className="text-xs text-lc-muted mt-0.5">
            {t('preferences.localData.clear.description')}
          </div>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirming(true)}
          disabled={clearing}
          className="shrink-0"
          data-testid="clear-cache-button"
        >
          {t('preferences.localData.clear.button')}
        </Button>
      </div>
      {confirming && (
        <Modal
          onClose={() => !clearing && setConfirming(false)}
          testId="clear-cache-confirm"
          panelClassName="w-full max-w-md mx-4 rounded-xl bg-lc-dark border border-lc-border p-6 shadow-xl"
        >
          <div className="text-lg font-semibold text-lc-white mb-2">{t('preferences.localData.confirm.title')}</div>
          <div className="text-sm text-lc-muted mb-4">
            {t('preferences.localData.confirm.description')}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={clearing}>
              {t('preferences.localData.confirm.cancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={onConfirm}
              disabled={clearing}
              data-testid="clear-cache-confirm-button"
            >
              {clearing ? t('preferences.localData.confirm.clearing') : t('preferences.localData.confirm.action')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
