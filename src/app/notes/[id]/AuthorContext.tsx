/**
 * Everything on a note page that isn't the note.
 *
 * A standalone note is a fragment: it arrives with no sense of who wrote it
 * or what else they say, which is why a bare note page feels like a dead end.
 * This is the context that makes it a destination — more from the author,
 * what they write about, who they read, and where they publish.
 *
 * Server-rendered along with the note, so it's in the HTML a crawler sees.
 */

import Link from 'next/link';
import { nip19 } from 'nostr-tools';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  displayNameFor,
  type AuthorRelays,
  type ViewerProfile,
} from '@/lib/server/nostr-fetch';
import { plainTextForPreview } from '@/lib/server/note-preview';
import FollowButton from './FollowButton';

function npubOf(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

function eventPath(note: Pick<NostrEvent, 'id' | 'pubkey'>): string {
  try {
    return `/notes/${nip19.neventEncode({ id: note.id, author: note.pubkey, kind: 1 })}`;
  } catch {
    return `/notes/${note.id}`;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^wss?:\/\//, '').replace(/\/+$/, '');
  }
}

export default function AuthorContext({
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
  const name = displayNameFor(author);
  const writeRelays = relays.write.slice(0, 6);

  const hasAnything = notes.length || hashtags.length || follows.length || writeRelays.length;
  if (!hasAnything) return null;

  return (
    <div className="min-w-0 space-y-8" data-testid="author-context">
      {notes.length > 0 && (
        <Section title={`More from ${name}`} testId="author-more-notes">
          <ul className="space-y-2">
            {notes.map((note) => {
              // Markdown and bech32 read as noise at two lines; this is the
              // same stripper the link previews use.
              const text = plainTextForPreview(note.content);
              return (
                <li key={note.id}>
                  <Link
                    href={eventPath(note)}
                    className="block min-w-0 rounded-xl border border-lc-border bg-lc-dark p-3 transition-colors hover:border-lc-green/40"
                  >
                    <p className="line-clamp-2 break-words text-sm text-lc-white">
                      {text || 'Shared media'}
                    </p>
                    <time
                      className="mt-1 block text-[10px] text-lc-muted"
                      dateTime={new Date(note.created_at * 1000).toISOString()}
                    >
                      {new Date(note.created_at * 1000).toLocaleDateString()}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {hashtags.length > 0 && (
        <Section title="Writes about" testId="author-hashtags">
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
        </Section>
      )}

      {follows.length > 0 && (
        <Section title="Follows" testId="author-follows">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {follows.map((profile) => (
              <li key={profile.pubkey}>
                <Link
                  href={`/p/${npubOf(profile.pubkey)}`}
                  className="flex min-w-0 items-center gap-2 rounded-xl border border-lc-border bg-lc-dark p-2 transition-colors hover:border-lc-green/40"
                >
                  {profile.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.picture}
                      alt=""
                      loading="lazy"
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
          </ul>
        </Section>
      )}

      {writeRelays.length > 0 && (
        <Section title="Publishes to" testId="author-relays">
          <ul className="flex flex-wrap gap-1.5">
            {writeRelays.map((relay) => (
              <li
                key={relay}
                className="max-w-full break-all rounded-full border border-lc-border px-2.5 py-1 font-mono text-[10px] text-lc-muted"
              >
                {hostOf(relay)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-lc-muted">
            From their NIP-65 relay list. These are where to look for their notes.
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0" data-testid={testId}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-lc-muted">{title}</h2>
      {children}
    </section>
  );
}
