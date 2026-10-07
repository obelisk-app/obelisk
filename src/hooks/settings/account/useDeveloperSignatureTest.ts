'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSignerReady } from '@/services/nostr-bridge';
import { setPreference } from '@/services/preferences/preferences';
import { requestMockSignatures } from '@/services/settings/signature-test';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { OBELISK_SIGNING_KINDS } from '@/utils/nostr/nostr-signing-kinds';
import {
  mockSignatureTemplate, pendingSignatures, signatureTally, type SignatureResult,
} from '@/utils/settings/signature-test';

/**
 * The developer settings block: ask the signer for every kind Obelisk signs
 * (to grant a remote signer its permissions in one go) and count the
 * answers; on the phone, the relay-log switch.
 */
export function useDeveloperSignatureTest() {
  const t = useTranslations();
  const signerReady = useSignerReady();
  const prefs = usePreferences();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<number, SignatureResult>>({});

  const run = async () => {
    setRunning(true);
    setResults(pendingSignatures(OBELISK_SIGNING_KINDS));
    await requestMockSignatures(
      OBELISK_SIGNING_KINDS,
      (kind) => mockSignatureTemplate(kind, {
        content: t('settings.developer.mockContent', { kind: String(kind) }),
        alt: t('settings.developer.mockAlt'),
      }),
      (kind, result) => setResults((current) => ({ ...current, [kind]: result })),
    );
    setRunning(false);
  };

  return {
    signerReady,
    relayDebug: prefs.developerRelayDebug,
    toggleRelayDebug: () => setPreference('developerRelayDebug', !prefs.developerRelayDebug),
    running,
    total: OBELISK_SIGNING_KINDS.length,
    ...signatureTally(results),
    run: () => void run(),
  };
}
