'use client';

import Link from 'next/link';
import { guidesHref } from '@/utils/guides/guide-urls';
import { useTranslation } from '@/i18n/context';
import { usePostQuantumProbe } from '@/hooks/app/settings/usePostQuantumProbe';

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
  const { t, locale } = useTranslation();
  const { myPubkey, state } = usePostQuantumProbe();

  if (!myPubkey) return null;

  if (state === null) {
    return <p className="mt-1 text-xs text-lc-muted">{t('settings.postQuantumChecking')}</p>;
  }

  if (state.canSend) {
    return (
      <p className="mt-1 text-xs text-lc-muted" data-testid="pq-status-ready">
        {t('settings.postQuantumDetected')} {t('settings.postQuantumReady')}
      </p>
    );
  }

  if (state.hasKeys) {
    // Either `capabilityUnknown` (NIP-07, no `nip44.schemes` marker) or a
    // non-NIP-07 session, which has no surface that could carry post-quantum
    // encryption at all. The user-visible outcome is identical in both:
    // messages keep going out classic, and Obelisk will switch on its own
    // once the signer says it can.
    return (
      <p className="mt-1 text-xs text-lc-muted" data-testid="pq-status-signer-unknown">
        {t('settings.postQuantumDetected')} {t('settings.postQuantumSignerUnknown')}
      </p>
    );
  }

  return (
    <p className="mt-1 text-xs text-lc-muted">
      {t('settings.postQuantumNotDetected')}{' '}
      <Link
        href={guidesHref(locale, 'quantum-safe-dms')}
        className="text-lc-green underline underline-offset-2 hover:text-lc-green/80"
      >
        {t('settings.postQuantumSetupLink')}
      </Link>
    </p>
  );
}
