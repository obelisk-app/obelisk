'use client';

/**
 * Search across the open network, from the feed.
 *
 * Distinct from the group search in the chat header, which is NIP-50 over
 * kind 9 on the active NIP-29 relay and answers "what was said in this
 * room". This searches Nostr: people, posts and hashtags.
 *
 * One input, three result sections, because people don't think in tabs —
 * they type a word and want whatever matches. The query is classified
 * (`parseQuery`) so a pasted `npub` resolves directly instead of being sent
 * to a full-text index that will never match it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useNostrUserSearch, type UserHit } from '@/lib/hooks/useNostrUserSearch';
import { parseQuery, searchHashtag, searchNotes, relatedHashtags } from '@/lib/social/search';
import { ensureSocialProfiles } from '@/lib/social/profiles';
import { useAuthor } from '@/lib/social/useAuthor';
import { useTranslation } from '@/i18n/context';
import UserAvatar from '@/components/UserAvatar';
import NoteCard from './NoteCard';

const DEBOUNCE_MS = 300;

export default function FeedSearch({
  initialQuery = '',
  onOpenProfile,
  onOpenNote,
  onOpenArticle,
  onClose,
}: {
  /** Prefill, for arriving from a trending tag rather than the search button. */
  initialQuery?: string;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  onOpenArticle?: (note: NostrEvent) => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState(initialQuery);
  // Seeded, not debounced-from-empty: arriving with a query already chosen
  // shouldn't cost a 300ms wait before anything happens.
  const [debounced, setDebounced] = useState(initialQuery);
  const [notes, setNotes] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(raw.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [raw]);

  const parsed = useMemo(() => parseQuery(debounced), [debounced]);

  // People search is already solved — NIP-19 decode, NIP-05 and NIP-50
  // kind-0 lookup — so reuse it rather than writing a second one.
  const people = useNostrUserSearch(
    parsed.kind === 'text' || parsed.kind === 'identifier' ? debounced : '',
  );

  useEffect(() => {
    let cancelled = false;
    if (parsed.kind === 'empty' || parsed.kind === 'identifier') {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const run = parsed.kind === 'hashtag'
      ? searchHashtag(parsed.tag)
      : searchNotes(parsed.text);

    run
      .then((results) => {
        if (cancelled) return;
        setNotes(results);
        // Names for the result authors, in one query.
        void ensureSocialProfiles(results.map((note) => note.pubkey));
      })
      .catch(() => { if (!cancelled) setNotes([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [parsed]);

  const userHits = useMemo(() => {
    const seen = new Set<string>();
    const out: UserHit[] = [];
    for (const hit of [people.directHit, people.nip05Hit, ...people.nostrResults]) {
      if (!hit || seen.has(hit.pubkey)) continue;
      seen.add(hit.pubkey);
      out.push(hit);
    }
    return out.slice(0, 8);
  }, [people.directHit, people.nip05Hit, people.nostrResults]);

  const tags = useMemo(() => relatedHashtags(notes), [notes]);
  const openProfile = useCallback((pubkey: string) => onOpenProfile?.(pubkey), [onOpenProfile]);
  const busy = loading || people.loading;
  const empty = debounced.length > 0 && !busy && notes.length === 0 && userHits.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="feed-search">
      {/*
        `h-14`, `lc-header-surface`, `px-5`: the app's header contract, same as the
        chat header and the relay top bar. This row was a bare full-width
        strip on the content background, so it read as part of the feed
        rather than as the surface's header, and it didn't line up with the
        sidebar's search box beside it.
      */}
      <div className="lc-header-surface flex h-14 shrink-0 items-center gap-2 border-b border-lc-border px-5">
        {/*
          Two searches exist and they answer different questions: the one in
          the sidebar is NIP-50 over this relay's channels ("what was said
          in this room"), and this one is the open network. Without a scope
          badge they look identical and the results are inexplicable.
        */}
        <span
          className="flex shrink-0 items-center gap-1.5 rounded-md border border-lc-green/40 bg-lc-green/10 px-2.5 py-1.5 text-[11px] font-semibold text-lc-green"
          data-testid="feed-search-scope"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          {t('social.searchScope')}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-lc-border bg-lc-black/40 px-3 py-2 focus-within:border-lc-green/60">
          <SearchIcon />
          <input
            autoFocus
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={t('social.searchPlaceholder')}
            aria-label={t('social.search')}
            className="min-w-0 flex-1 bg-transparent text-sm text-lc-white outline-none placeholder:text-lc-muted"
            data-testid="feed-search-input"
          />
          {busy && <span className="lc-spinner h-4 w-4 shrink-0" aria-hidden="true" />}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lc-pill-secondary shrink-0 px-4 py-1.5 text-xs"
            data-testid="feed-search-close"
          >
            {t('common.close')}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {debounced.length === 0 && (
          <p className="px-5 py-10 text-center text-xs text-lc-muted" data-testid="feed-search-hint">
            {t('social.searchHint')}
          </p>
        )}

        {empty && (
          <p className="px-5 py-10 text-center text-sm text-lc-muted" data-testid="feed-search-empty">
            {t('social.searchEmpty')}
          </p>
        )}

        {userHits.length > 0 && (
          <Section title={t('social.searchPeople')} testId="search-people">
            {userHits.map((hit) => (
              <PersonRow key={hit.pubkey} hit={hit} onOpen={openProfile} />
            ))}
          </Section>
        )}

        {tags.length > 0 && (
          <Section title={t('social.searchTags')} testId="search-tags">
            <div className="flex flex-wrap gap-1.5 px-5 pb-3">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setRaw(`#${tag}`)}
                  className="rounded-full bg-lc-dark px-2.5 py-1 text-[11px] text-lc-muted transition-colors hover:text-lc-green"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </Section>
        )}

        {notes.length > 0 && (
          <Section title={t('social.searchPosts')} testId="search-posts">
            <div className="divide-y divide-lc-border/70">
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onOpenProfile={openProfile}
                  onOpenNote={onOpenNote}
                  onOpenArticle={onOpenArticle}
                />
              ))}
            </div>
          </Section>
        )}
      </div>
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
    <section data-testid={testId}>
      <h3 className="px-5 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function PersonRow({ hit, onOpen }: { hit: UserHit; onOpen: (pubkey: string) => void }) {
  // Merge with our own resolver: NIP-50 hits often carry no picture, and the
  // cached profile usually does.
  const author = useAuthor(hit.pubkey);
  const name = author.displayName || author.name || hit.displayName || hit.pubkey.slice(0, 12);
  const nip05 = author.nip05 || hit.nip05;

  return (
    <button
      type="button"
      onClick={() => onOpen(hit.pubkey)}
      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      data-testid="search-person"
    >
      <UserAvatar
        pubkey={hit.pubkey}
        picture={author.picture ?? hit.picture}
        size={9}
        name={name}
        alt=""
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-lc-white">{name}</span>
        {nip05 && <span className="block truncate text-[11px] text-lc-green">{nip05}</span>}
      </span>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="shrink-0 text-lc-white/70"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
