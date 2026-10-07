'use client';

import { useTranslations } from 'next-intl';
import DmOptInGate from '../../../dm/DmOptInGate';

/** The DMs tab before the person has turned DMs on: the title and the opt-in gate. */
export function MobileDmOptInScreen({
  onSecondary,
  secondaryLabel,
}: {
  onSecondary: () => void;
  secondaryLabel?: string;
}) {
  const t = useTranslations();
  return (
    <div className="screen active" data-screen="dms-list">
      <div className="app-header">
        <h2>{t('dm.title')}</h2>
      </div>
      <DmOptInGate
        surface="mobile"
        secondaryLabel={secondaryLabel}
        onSecondary={onSecondary}
      />
    </div>
  );
}
