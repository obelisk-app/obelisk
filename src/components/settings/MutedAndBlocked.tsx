'use client';

/**
 * Review and undo mutes and blocks.
 *
 * `useModerationStore` has held `mutedPubkeys` / `blockedPubkeys` since it was
 * added, but the only way to reach them was the ⋯ menu on a note or profile
 * from the person you muted — which is exactly the content you no longer see.
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
import { hexToNpub } from '@nostr-wot/data';
import { useUserMetadata } from '@/lib/nostr-bridge';
import { useModerationStore } from '@/store/moderation';
import { useTranslation } from '@/i18n/context';
import UserAvatar from '@/components/UserAvatar';

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
      <div className="text-xs font-semibold uppercase tracking-wider text-lc-muted">
        {t('moderation.title')}
      </div>
      {body}
    </div>
  );
}

function ModerationRow({ pubkey, kind }: { pubkey: string; kind: 'mute' | 'block' }) {
  const { t } = useTranslation();
  const meta = useUserMetadata(pubkey);
  const toggleMute = useModerationStore((state) => state.toggleMute);
  const toggleBlock = useModerationStore((state) => state.toggleBlock);

  const name = meta?.displayName || meta?.name || shortNpub(pubkey);

  return (
    <li className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-black px-2 py-1.5">
      <UserAvatar pubkey={pubkey} picture={meta?.picture} size={6} name={name} alt={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-lc-white">{name}</div>
        <div className="text-[10px] text-lc-muted">
          {t(kind === 'mute' ? 'moderation.muted' : 'moderation.blocked')}
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-lg border border-lc-border px-2 py-1 text-[10px] text-lc-muted hover:text-lc-white"
        onClick={() => (kind === 'mute' ? toggleMute(pubkey) : toggleBlock(pubkey))}
        data-testid={`moderation-undo-${kind}`}
      >
        {t(kind === 'mute' ? 'profileFeed.unmute' : 'profileFeed.unblock')}
      </button>
    </li>
  );
}

function shortNpub(pubkey: string): string {
  try {
    return `${hexToNpub(pubkey).slice(0, 14)}…`;
  } catch {
    return `${pubkey.slice(0, 10)}…`;
  }
}
