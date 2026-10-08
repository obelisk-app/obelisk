import List from '@/components/ui/layout/List';
/**
 * Everything on a note page that isn't the note.
 *
 * A standalone note is a fragment: it arrives with no sense of who wrote it
 * or what else they say, which is why a bare note page feels like a dead end.
 * This is the context that makes it a destination - more from the author,
 * what they write about, who they read, and where they publish.
 *
 * Server-rendered along with the note, so it's in the HTML a crawler sees.
 */

import Link from '@/components/ui/navigation/Link';
import { serverLocale } from '@/services/server/i18n/locale';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  displayNameFor,
  type AuthorRelays,
  type ViewerProfile,
} from '@/services/server/viewer/nostr-fetch';
import FollowButton from './FollowButton';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { safeNpub } from '@/utils/identity/short-npub';
import { relayHostLabel } from '@/utils/relay-url/relay-host';
import AuthorDetailsSection from './AuthorDetailsSection';
import { plainTextForPreview } from '@/services/server/viewer/note-preview';
import { noteIdentifier } from '@/services/social/note-links';
import { NOTE_VIEWER_PATH } from '@/constants/social/note-links';
import { formatDate } from '@/utils/format/format';
import Text from '@/components/ui/layout/Text';

export default async function AuthorDetails({
  author,
  notes,
  hashtags,
  follows,
  relays,
}: {
  author: ViewerProfile;
  notes: NostrEvent[];
  hashtags: string[];
  follows: ViewerProfile[];
  relays: AuthorRelays;
}) {
  const { t, locale } = await serverLocale();
  const name = displayNameFor(author);
  const writeRelays = relays.write.slice(0, 6);

  const hasAnything = notes.length || hashtags.length || follows.length || writeRelays.length;
  if (!hasAnything) return null;

  return (
    <div className="min-w-0 space-y-8" data-testid="author-context">
      {notes.length > 0 && (
        <AuthorDetailsSection title={t('social.viewer.moreFrom', { name })} testId="author-more-notes">
          <List marker="none" spacing="normal">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  href={`${NOTE_VIEWER_PATH}/${noteIdentifier(note)}`}
                  className="block min-w-0 rounded-xl border border-lc-border bg-lc-dark p-3 transition-colors hover:border-lc-green/40"
                >
                  <Text as="p" size="sm" tone="default" className="line-clamp-2 break-words">
                    {plainTextForPreview(note.content) || t('social.viewer.sharedMedia')}
                  </Text>
                  <Text as="time" size="10" tone="muted"
                    className="mt-1 block"
                    dateTime={new Date(note.created_at * 1000).toISOString()}
                  >
                    {formatDate(locale, note.created_at, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </Text>
                </Link>
              </li>
            ))}
          </List>
        </AuthorDetailsSection>
      )}

      {hashtags.length > 0 && (
        <AuthorDetailsSection title={t('social.author.writesAbout')} testId="author-hashtags">
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map((tag) => (
              <Link
                key={tag}
                href={`/t/${encodeURIComponent(tag)}`}
                className="max-w-full break-all rounded-full bg-lc-dark px-2.5 py-1 text-[11px] text-lc-muted transition-colors hover:text-lc-green"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </AuthorDetailsSection>
      )}

      {follows.length > 0 && (
        <AuthorDetailsSection title={t('social.author.follows')} testId="author-follows">
          <List marker="none" spacing="none" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {follows.map((profile) => (
              <li key={profile.pubkey}>
                <Link
                  href={`/p/${safeNpub(profile.pubkey)}`}
                  className="flex min-w-0 items-center gap-2 rounded-xl border border-lc-border bg-lc-dark p-2 transition-colors hover:border-lc-green/40"
                >
                  {profile.picture ? (
                    <RemoteImage
                      src={profile.picture}
                      alt=""
                      decoding="async"
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lc-black text-[11px] font-semibold">
                      {displayNameFor(profile).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-lc-white">
                    {displayNameFor(profile)}
                  </span>
                  {/* A client island: the rest of this page is static HTML
                      a crawler reads, but following needs a signer. */}
                  <FollowButton pubkey={profile.pubkey} />
                </Link>
              </li>
            ))}
          </List>
        </AuthorDetailsSection>
      )}

      {writeRelays.length > 0 && (
        <AuthorDetailsSection title={t('social.author.publishesTo')} testId="author-relays">
          <List marker="none" spacing="none" className="flex flex-wrap gap-1.5">
            {writeRelays.map((relay) => (
              <li
                key={relay}
                className="max-w-full break-all rounded-full border border-lc-border px-2.5 py-1 font-mono text-[10px] text-lc-muted"
              >
                {relayHostLabel(relay)}
              </li>
            ))}
          </List>
          <Text as="p" size="10" tone="muted" className="mt-2">
            {t('social.author.relaysHelp')}
          </Text>
        </AuthorDetailsSection>
      )}
    </div>
  );
}
