'use client';

/**
 * Review and undo mutes and blocks.
 *
 * `useModerationStore` has held `mutedPubkeys` / `blockedPubkeys` since it was
 * added, but the only way to reach them was the ⋯ menu on a note or profile
 * from the person you muted, which is exactly the content you no longer see.
 * Muting was effectively irreversible unless you could find them again.
 *
 * Note this is deliberately LOCAL-only and not published as a NIP-51 kind
 * 10000 list. Publishing would be the portable thing to do, but the
 * ecosystem makes it a trap right now: private (encrypted) entries are
 * invisible to Damus and both Primal clients, and Primal iOS republishes
 * kind 10000 with an empty `content`, wiping every private mute the user had
 * from another client. Until that settles, a local list can't be silently
 * destroyed by another app.
 */

import { useTranslations } from 'next-intl';
import Text from '@/components/ui/layout/Text';
import { useMutedAndBlocked } from '@/hooks/settings/privacy/useMutedAndBlocked';
import { moderationEntryKey } from '@/utils/settings/moderation-entries';
import ModerationRow from './ModerationRow';

export default function MutedAndBlocked({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const entries = useMutedAndBlocked();

  const body = entries.length === 0 ? (
    <Text as="p" variant="caption" data-testid="moderation-empty">
      {t('settings.moderation.empty')}
    </Text>
  ) : (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <ModerationRow key={moderationEntryKey(entry)} pubkey={entry.pubkey} kind={entry.kind} />
      ))}
    </ul>
  );

  return mobile ? (
    <div className="settings-section" data-testid="muted-and-blocked">
      <div className="settings-section-title">{t('settings.moderation.title')}</div>
      <div className="settings-row !block space-y-2">{body}</div>
    </div>
  ) : (
    <div className="space-y-2 border-t border-lc-border pt-4" data-testid="muted-and-blocked">
      <Text as="div" variant="label" size="xs" weight="semibold" tone="muted">
        {t('settings.moderation.title')}
      </Text>
      {body}
    </div>
  );
}
