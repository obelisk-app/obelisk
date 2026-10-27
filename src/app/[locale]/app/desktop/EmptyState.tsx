'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRelayAccess } from '@/services/nostr-bridge';
import RelayAccessHelp from '@/components/relay/RelayAccessHelp';
import { AddRelayModal } from '../rail/AddRelayModal';

/**
 * The main pane with nothing open. Usually "pick a channel"; when the relay
 * refused this key (`restricted`) the sidebar has nothing to pick and there
 * is nothing to create, so it says how to get in instead.
 */
export function EmptyState() {
  const t = useTranslations();
  const access = useRelayAccess();
  const [choosingRelay, setChoosingRelay] = useState(false);
  return (
    <div className="flex h-full items-center justify-center px-6 text-lc-muted" data-testid="desktop-empty-state">
      {access === 'restricted' ? (
        <RelayAccessHelp onChooseRelay={() => setChoosingRelay(true)} />
      ) : (
        <div className="text-center">
          <div className="text-lg font-medium text-lc-white">{t('shell.desktop.empty.title')}</div>
          <div className="mt-1 text-sm">{t('shell.desktop.empty.description')}</div>
        </div>
      )}
      {choosingRelay && <AddRelayModal onClose={() => setChoosingRelay(false)} />}
    </div>
  );
}
