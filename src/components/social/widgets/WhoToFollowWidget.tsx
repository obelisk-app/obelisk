'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import { useMemo } from 'react';
import { shortNpub } from '@nostr-wot/data';
import { useMyFollows, useMyPubkey } from '@/lib/nostr-bridge';
import { suggestedAuthors } from '@/lib/social/feed-people';
import { useAuthor } from '@/lib/social/useAuthor';
import { useTranslation } from '@/i18n/context';
import UserAvatar from '@/components/UserAvatar';
import FollowButton from '@/app/notes/[id]/FollowButton';
import WidgetCard, { WidgetEmpty } from './WidgetCard';

/**
 * People in the feed the reader does not follow yet.
 *
 * Drawn from the loaded window rather than a recommendation query, so it
 * costs nothing and stays honest: these are people who actually turned up in
 * front of you, not an algorithm's opinion about who you'd like.
 */
export default function WhoToFollowWidget({
  notes,
  onOpenProfile,
}: {
  notes: readonly NostrEvent[];
  onOpenProfile?: (pubkey: string) => void;
}) {
  const { t } = useTranslation();
  const myPubkey = useMyPubkey();
  const follows = useMyFollows();

  const people = useMemo(
    () => suggestedAuthors(notes, {
      limit: 5,
      exclude: myPubkey ? [...follows, myPubkey] : follows,
    }),
    [notes, follows, myPubkey],
  );

  return (
    <WidgetCard title={t('social.whoToFollow')} testId="widget-who-to-follow">
      {people.length === 0 ? (
        <WidgetEmpty testId="who-to-follow-empty">{t('social.whoToFollowEmpty')}</WidgetEmpty>
      ) : (
        <ul>
          {people.map((person) => (
            <PersonRow key={person.pubkey} pubkey={person.pubkey} onOpenProfile={onOpenProfile} />
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function PersonRow({
  pubkey,
  onOpenProfile,
}: {
  pubkey: string;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const meta = useAuthor(pubkey);
  const name = meta?.displayName || meta?.name || shortNpub(pubkey);

  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5" data-testid="who-to-follow-row">
      <button
        type="button"
        onClick={() => onOpenProfile?.(pubkey)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <UserAvatar pubkey={pubkey} picture={meta?.picture} size={8} name={name} alt={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-lc-white">{name}</span>
          {meta?.nip05 && (
            <span className="block truncate text-[10px] text-lc-muted">{meta.nip05}</span>
          )}
        </span>
      </button>
      <FollowButton pubkey={pubkey} />
    </li>
  );
}
