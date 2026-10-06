'use client';

/**
 * What an account with no follows sees instead of "try the Global tab".
 *
 * A fresh key follows nobody, so the Following feed is empty on the first
 * run: the one moment where the app has to prove it's worth using. The old
 * copy pointed at Global, which is a firehose of strangers in languages you
 * may not read, and left the actual job (find people worth following) to the
 * person who just arrived.
 *
 * Starter packs are the convention the rest of the network already uses.
 * Follow one and the feed fills.
 */

import { displayNameFor } from '@/utils/identity/display-name';
import { useCallback, useEffect, useState } from 'react';
import { getBridge, useMyContactList, useMyFollows } from '@/services/nostr-bridge';
import { usePreferences } from '@/hooks/usePreferences';
import { ensureSocialProfiles } from '@/services/social/profiles';
import {
  fetchStarterPacks,
  followedCount,
  mergedFollowTags,
  type StarterPack,
} from '@/services/social/starter-packs';
import { useAuthor } from '@/hooks/social/useAuthor';
import { useToastStore } from '@/store/toast';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import UserAvatar from '@/components/ui/UserAvatar';
import EmptyState from '@/components/ui/EmptyState';

/**
 * How many members to name per pack.
 *
 * Six was too few to tell packs apart at a glance, but this also bounds a
 * profile fan-out on a discovery surface: every face is a kind-0 lookup
 * across the social relays, for every pack on screen.
 */
const FACES = 12;

export default function StarterPacks({
  onOpenProfile,
}: {
  onOpenProfile?: (pubkey: string) => void;
}) {
  const t = useTranslations();
  const relays = usePreferences().socialRelays;
  const follows = useMyFollows();
  const contactEvent = useMyContactList();
  const [packs, setPacks] = useState<StarterPack[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStarterPacks({ relays })
      .then((result) => {
        if (cancelled) return;
        setPacks(result);
        // Names and faces for the members we're about to show, in one query.
        void ensureSocialProfiles(result.flatMap((pack) => pack.members.slice(0, FACES)));
      })
      .catch(() => { if (!cancelled) setPacks([]); });
    return () => { cancelled = true; };
  }, [relays]);

  const followPack = useCallback(async (pack: StarterPack) => {
    setBusy(pack.id);
    try {
      const bridge = await getBridge();
      await bridge.publishEvent({
        kind: 3,
        content: contactEvent?.content ?? '',
        // One merged kind 3, not one per member: follows are a single
        // replaceable event, so a per-person loop would race itself and
        // end with whichever write landed last: i.e. one follow.
        tags: mergedFollowTags(contactEvent?.tags ?? [], pack.members),
        created_at: Math.max(Math.floor(Date.now() / 1000), (contactEvent?.created_at ?? 0) + 1),
      }, { extraRelays: relays, mode: 'replace' });
      useToastStore.getState().pushToast({
        title: t('social.packFollowed'),
        body: pack.title,
      });
    } catch {
      useToastStore.getState().pushToast({ title: t('social.actionFailed'), body: pack.title });
    } finally {
      setBusy(null);
    }
  }, [contactEvent, relays, t]);

  /*
    The heading paints immediately, in every state.

    A brand-new account's whole first impression was two anonymous grey
    rectangles for several seconds while this fetch ran: the screen didn't
    even say what was coming. Saying "Find people to follow" costs nothing
    and turns the wait into a labelled one.
  */
  const heading = (
    <div className="px-1">
      <h2 className="text-base font-semibold text-lc-white">{t('social.packsTitle')}</h2>
      <p className="mt-0.5 text-[13px] text-lc-muted">{t('social.packsSubtitle')}</p>
    </div>
  );

  if (packs === null) {
    return (
      <div className="space-y-3 p-4" data-testid="starter-packs-loading">
        {heading}
        {[0, 1].map((index) => <div key={index} className="lc-skeleton h-28 rounded-xl" />)}
      </div>
    );
  }

  if (packs.length === 0) {
    return (
      <div className="space-y-3 p-4" data-testid="starter-packs-empty">
        {heading}
        <EmptyState as="p" padding="md" className="px-1">
          {t('social.packsEmpty')}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4" data-testid="starter-packs">
      {heading}

      {packs.map((pack) => {
        const already = followedCount(pack, follows);
        const remaining = pack.members.length - already;
        return (
          <Card
            as="section"
            key={pack.id}
            data-testid="starter-pack"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold text-lc-white">{pack.title}</h3>
                {pack.description && (
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-lc-muted">{pack.description}</p>
                )}
                <p className="mt-1 text-[11px] text-lc-muted">
                  {t('social.packPeopleCount', { count: pack.members.length })}
                  {already > 0 && ` · ${t('social.packAlreadyCount', { count: already })}`}
                </p>
              </div>
              <Button
                variant="pill"
                size="xs"
                className="shrink-0"
                onClick={() => void followPack(pack)}
                disabled={busy !== null || remaining === 0}
                data-testid="starter-pack-follow"
              >
                {busy === pack.id
                  ? t('common.saving')
                  : remaining === 0
                    ? t('social.packAllFollowed')
                    : `${t('mobile.profile.follow')} ${remaining}`}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {pack.members.slice(0, FACES).map((member) => (
                <PackFace key={member} pubkey={member} onOpen={onOpenProfile} />
              ))}
              {pack.members.length > FACES && (
                <span className="self-center text-[11px] text-lc-muted">
                  +{pack.members.length - FACES}
                </span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function PackFace({
  pubkey,
  onOpen,
}: {
  pubkey: string;
  onOpen?: (pubkey: string) => void;
}) {
  const author = useAuthor(pubkey);
  // Not `pubkey.slice(0, 8)`: every chip in every pack read as an 8-char hex
  // prefix, so a newcomer could not tell who they were about to follow.
  const name = displayNameFor(pubkey, author);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(pubkey)}
      className="flex items-center gap-1.5 rounded-full border border-lc-border bg-lc-black py-0.5 pl-0.5 pr-2.5 transition-colors hover:border-lc-green/40"
      data-testid="starter-pack-face"
      title={name}
    >
      <UserAvatar pubkey={pubkey} picture={author.picture} size={6} name={name} alt="" />
      <span className="max-w-[7rem] truncate text-[11px] text-lc-white">{name}</span>
    </button>
  );
}
