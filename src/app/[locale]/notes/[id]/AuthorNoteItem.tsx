import type { Event as NostrEvent } from 'nostr-tools';
import Link from '@/components/ui/navigation/Link';
import type { Locale } from '@/i18n';
import { plainTextForPreview } from '@/services/server/viewer/note-preview';
import { noteIdentifier } from '@/services/social/note-links';
import { NOTE_VIEWER_PATH } from '@/constants/social/note-links';
import { formatDate } from '@/utils/format/format';
import Text from '@/components/ui/layout/Text';

/** Another of the author's notes: two lines of its text (or `sharedMedia` when it has none) and its date, linking to it. */
export default function AuthorNoteItem({ note, locale, sharedMedia }: { note: NostrEvent; locale: Locale; sharedMedia: string }) {
  // Markdown and bech32 read as noise at two lines; this is the same
  // stripper the link previews use.
  const text = plainTextForPreview(note.content);
  return (
    <li>
      <Link
        href={`${NOTE_VIEWER_PATH}/${noteIdentifier(note)}`}
        className="block min-w-0 rounded-xl border border-lc-border bg-lc-dark p-3 transition-colors hover:border-lc-green/40"
      >
        <Text as="p" size="sm" tone="default" className="line-clamp-2 break-words">
          {text || sharedMedia}
        </Text>
        <Text as="time" size="10" tone="muted"
          className="mt-1 block"
          dateTime={new Date(note.created_at * 1000).toISOString()}
        >
          {formatDate(locale, note.created_at, { year: 'numeric', month: 'short', day: 'numeric' })}
        </Text>
      </Link>
    </li>
  );
}
