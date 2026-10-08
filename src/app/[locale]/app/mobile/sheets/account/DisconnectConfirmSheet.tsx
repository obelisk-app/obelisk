'use client';

import { useTranslations } from 'next-intl';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetActions from '@/components/ui/overlays/SheetActions';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import { LogOutIcon } from '@/assets/icons';

export function DisconnectConfirmSheet({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const t = useTranslations();
  return (
    <Sheet onClose={onCancel} screen="disconnect-confirm" label={t('mobile.settings.disconnectTitle')}>
      <SheetHeader
        variant="confirm"
        icon={
          <LogOutIcon size={null} strokeWidth={2} />
        }
        title={t('mobile.settings.disconnectTitle')}
        subtitle={t('mobile.settings.disconnectDescription')}
      />
      <SheetActions
        primary={{
          label: t('mobile.settings.disconnectConfirm'),
          onClick: onConfirm,
          tone: 'danger',
          testId: 'disconnect-confirm',
          icon: (
            <LogOutIcon size={null} strokeWidth={2} />
          ),
        }}
        onCancel={onCancel}
      />
    </Sheet>
  );
}
