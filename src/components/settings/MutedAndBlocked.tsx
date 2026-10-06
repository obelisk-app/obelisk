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

import { useMemo } from 'react';
import { useUserMetadata } from '@/services/nostr-bridge';
import { useModerationStore } from '@/store/moderation';
import { useTranslation } from '@/i18n/context';
import UserAvatar from '@/components/ui/UserAvatar';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Text from '@/components/ui/Text';
import { shortNpubLabel } from '@/utils/identity/short-npub';

export default function MutedAndBlocked({ mobile = false }: { mobile?: boolean }) {
  const { t } = useTranslation();
  const muted = useModerationStore((state) => state.mutedPubkeys);
  const blocked = useModerationStore((state) => state.blockedPubkeys);

  const entries = useMemo(() => [
    ...muted.map((pubkey) => ({ pubkey, kind: 'mute' as const })),
    ...blocked.map((pubkey) => ({ pubkey, kind: 'block' as const })),
  ], [muted, blocked]);

  const body = entries.length === 0 ? (
    <p className="text-xs text-lc-muted" data-testid="moderation-empty">
      {t('moderation.empty')}
    </p>
  ) : (
    <ul className="space-y-1">
      {entries.map((entry) => (
        <ModerationRow key={`${entry.kind}:${entry.pubkey}`} pubkey={entry.pubkey} kind={entry.kind} />
      ))}
    </ul>
  );

  return mobile ? (
    <div className="settings-section" data-testid="muted-and-blocked">
      <div className="settings-section-title">{t('moderation.title')}</div>
      <div className="settings-row !block space-y-2">{body}</div>
    </div>
  ) : (
    <div className="space-y-2 border-t border-lc-border pt-4" data-testid="muted-and-blocked">
      <Text as="div" variant="label" size="xs" weight="semibold" tone="muted">
        {t('moderation.title')}
      </Text>
      {body}
    </div>
  );
}

function ModerationRow({ pubkey, kind }: { pubkey: string; kind: 'mute' | 'block' }) {
  const { t } = useTranslation();
  const meta = useUserMetadata(pubkey);
  const toggleMute = useModerationStore((state) => state.toggleMute);
  const toggleBlock = useModerationStore((state) => state.toggleBlock);

  const name = meta?.displayName || meta?.name || shortNpubLabel(pubkey);

  return (
    <Card as="li" surface="black" radius="lg" padding="row" className="flex items-center gap-2">
      <UserAvatar pubkey={pubkey} picture={meta?.picture} size={6} name={name} alt={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-lc-white">{name}</div>
        <Text as="div" size="10" tone="muted">
          {t(kind === 'mute' ? 'moderation.muted' : 'moderation.blocked')}
        </Text>
      </div>
      <Button
        variant="outline"
        size="xs"
        className="shrink-0"
        onClick={() => (kind === 'mute' ? toggleMute(pubkey) : toggleBlock(pubkey))}
        data-testid={`moderation-undo-${kind}`}
      >
        {t(kind === 'mute' ? 'profileFeed.unmute' : 'profileFeed.unblock')}
      </Button>
    </Card>
  );
}
