import type { Event as NostrEvent } from 'nostr-tools';
import { Link } from '@/i18n/navigation';
import type { Locale } from '@/i18n';
import { displayNameFor, type ViewerProfile } from '@/services/server/viewer/nostr-fetch';
import { plainTextForPreview, previewImage } from '@/services/server/viewer/note-preview';
import { NOTE_VIEWER_PATH, noteIdentifier } from '@/services/social/note-links';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { formatDate } from '@/utils/format/format';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import HashtagAvatar from './HashtagAvatar';
import Text from '@/components/ui/layout/Text';

/** One note under the hashtag: author, date, three lines of text (or `sharedMedia`) and its first image, linking to the note. */
export default function HashtagNoteItem({
  note,
  profile,
  locale,
  sharedMedia,
}: {
  note: NostrEvent;
  profile: ViewerProfile | undefined;
  locale: Locale;
  sharedMedia: string;
}) {
  const text = plainTextForPreview(note.content);
  const image = previewImage(note);
  return (
    <li>
      <Link href={`${NOTE_VIEWER_PATH}/${noteIdentifier(note)}`} className="block px-5 py-4 transition-colors hover:bg-white/[0.03]">
        <div className="mb-1.5 flex items-center gap-2">
          <HashtagAvatar profile={profile} pubkey={note.pubkey} />
          <span className="truncate text-sm font-semibold">
            {profile ? displayNameFor(profile) : shortNpubLabel(note.pubkey)}
          </span>
          <time
            className="ml-auto shrink-0 text-[10px] text-lc-muted"
            dateTime={new Date(note.created_at * 1000).toISOString()}
          >
            {formatDate(locale, note.created_at, { year: 'numeric', month: 'short', day: 'numeric' })}
          </time>
        </div>
        <Text as="p" size="sm" tone="default" className="line-clamp-3">{text || sharedMedia}</Text>
        {image && (
          <RemoteImage
            src={image}
            alt=""
            decoding="async"
            className="mt-2 max-h-56 w-full rounded-xl object-cover"
          />
        )}
      </Link>
    </li>
  );
}
