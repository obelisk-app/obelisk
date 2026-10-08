'use client';

import Link from '@/components/ui/navigation/Link';
import { guidePath } from '@/utils/guides/guide-urls';
import { useTranslations } from 'next-intl';
import { usePostQuantumProbe } from '@/hooks/shell/settings/usePostQuantumProbe';
import Text from '@/components/ui/layout/Text';

/**
 * Read-only status line beneath the post-quantum toggle. Reports the three
 * states `selfPqState()` distinguishes, because they have genuinely different
 * outcomes for the user:
 *
 *   - `canSend`, the signer advertises the `pq` scheme; sends really are
 *     sealed post-quantum whenever the peer publishes keys.
 *   - `capabilityUnknown`, keys are published but the signer reports
 *     nothing, so the send path deliberately stays classic rather than risk
 *     a downgrade it would then mislabel as protected. Saying only "keys
 *     detected" here would be the dead-end the UX audit found: the user does
 *     everything right and nothing changes, with no explanation.
 *   - no keys at all, point at the setup guide.
 */
export function PostQuantumStatusRow() {
  const t = useTranslations();
  const { myPubkey, state } = usePostQuantumProbe();

  if (!myPubkey) return null;

  if (state === null) {
    return <Text as="p" variant="caption" className="mt-1">{t('settings.postQuantumChecking')}</Text>;
  }

  if (state.canSend) {
    return (
      <Text as="p" variant="caption" className="mt-1" data-testid="pq-status-ready">
        {t('settings.postQuantumDetected')} {t('settings.postQuantumReady')}
      </Text>
    );
  }

  if (state.hasKeys) {
    // Either `capabilityUnknown` (NIP-07, no `nip44.schemes` marker) or a
    // non-NIP-07 session, which has no surface that could carry post-quantum
    // encryption at all. The user-visible outcome is identical in both:
    // messages keep going out classic, and Obelisk will switch on its own
    // once the signer says it can.
    return (
      <Text as="p" variant="caption" className="mt-1" data-testid="pq-status-signer-unknown">
        {t('settings.postQuantumDetected')} {t('settings.postQuantumSignerUnknown')}
      </Text>
    );
  }

  return (
    <Text as="p" variant="caption" className="mt-1">
      {t('settings.postQuantumNotDetected')}{' '}
      <Link
        href={guidePath('quantum-safe-dms')}
        variant="prose"
      >
        {t('settings.postQuantumSetupLink')}
      </Link>
    </Text>
  );
}
