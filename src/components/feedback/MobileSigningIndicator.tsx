'use client';

import Button from '@/components/ui/buttons/Button';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMobileSigningIndicator } from '@/hooks/feedback/useMobileSigningIndicator';
import MobileSigningPopup from './MobileSigningPopup';

/** The phone top bar's signer dot; a tap explains what is being signed. */
export default function MobileSigningIndicator() {
  const t = useTranslations();
  const vm = useMobileSigningIndicator();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="mobileIcon"
        type="button"
        className="action-sign"
        onClick={() => setOpen(true)}
        aria-label={t('mobile.signing.label')}
        data-testid="mobile-signing-indicator"
        data-status={vm.status}
      >
        <span className={`h-3.5 w-3.5 rounded-full border-2 border-black/40 shadow-[0_0_8px_currentColor] ${vm.dotClass}`} aria-hidden="true" />
      </Button>
      {open && <MobileSigningPopup entry={vm.signing} onClose={() => setOpen(false)} />}
    </>
  );
}
