'use client';

/**
 * "New message" on desktop: type a name, a NIP-05 or an npub and pick a
 * person from live results.
 *
 * It used to be a bare text box with Cancel / Start buttons that only
 * understood a pasted npub, hex key or exact NIP-05 - no names, no results, no
 * way to see who you were about to message. It now runs the same people
 * search the rest of the app uses (`useNostrUserSearch`: NIP-19 decode, NIP-05
 * resolution and NIP-50 name search on the index relays), and picking a
 * result opens the thread. Keyboard: ↑/↓ to move, Enter to open, Esc to close.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useNostrUserSearch, type UserHit } from '@/hooks/identity/useNostrUserSearch';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { displayNameFor } from '@/utils/identity/display-name';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { recordNip05Resolution } from '@/services/identity/nip05-verify';
import { useNip05Status } from '@/hooks/identity/useNip05Status';
import UserAvatar from '@/components/ui/media/UserAvatar';
import { CheckBadgeIcon } from '@/components/ui/icons/icons';
import Input from '@/components/ui/forms/Input';
import CloseButton from '@/components/ui/buttons/CloseButton';

function ResultRow({ hit, active, onPick, onHover }: { hit: UserHit; active: boolean; onPick: () => void; onHover: () => void }) {
  // A pasted npub comes back with no profile; resolve it the way the rest of
  // the DM surface does, so the row shows who it is before you open it.
  const author = useAuthor(hit.pubkey);
  const name = hit.displayName || displayNameFor(hit.pubkey, author);
  const picture = hit.picture ?? author.picture;
  const nip05 = hit.nip05 ?? author.nip05;
  const sub = nip05 ?? shortNpubLabel(hit.pubkey);
  // A kind-0 `nip05` is a free-text claim. `peek` never fetches (a row
  // should not leak the reader's IP to a domain the profile author picked);
  // it turns green only when a lookup elsewhere, such as the NIP-05 search
  // above or an opened popover, already confirmed the pair.
  const nip05State = useNip05Status(hit.pubkey, nip05, 'peek');
  const verified = nip05State === 'verified';
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onPick}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${active ? 'bg-lc-green/15' : 'hover:bg-white/5'}`}
      data-testid="dm-compose-result"
    >
      <UserAvatar pubkey={hit.pubkey} picture={picture} name={name} size={8} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-lc-white">{name}</span>
        <span
          className={`flex items-center gap-1 text-[11px] ${verified ? 'text-lc-green' : 'text-lc-muted'}`}
          data-testid="dm-compose-result-sub"
          data-nip05-state={nip05 ? nip05State : undefined}
        >
          {verified && <CheckBadgeIcon size={11} />}
          <span className="truncate">{sub}</span>
        </span>
      </span>
    </button>
  );
}

export default function ComposeDm({
  onClose,
  onPicked,
}: {
  onClose: () => void;
  onPicked: (pubkeyHex: string) => void;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { directHit, nip05Hit, nostrResults, loading } = useNostrUserSearch(query);

  // The NIP-05 hit came from the `.well-known` document itself (the reader
  // typed the handle and it resolved to this pubkey), so the pair is
  // established; record it so the row can show the badge without a second
  // request.
  useEffect(() => {
    if (nip05Hit?.nip05) recordNip05Resolution(nip05Hit.pubkey, nip05Hit.nip05);
  }, [nip05Hit]);

  const results = useMemo(() => {
    const seen = new Set<string>();
    return [directHit, nip05Hit, ...nostrResults]
      .filter((hit): hit is UserHit => !!hit && !seen.has(hit.pubkey) && !!seen.add(hit.pubkey))
      .slice(0, 8);
  }, [directHit, nip05Hit, nostrResults]);
  const searching = query.trim().length >= 2 || results.length > 0;
  // Keep the highlight on the list as it changes under the cursor.
  const selected = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => { inputRef.current?.focus(); }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' && results.length > 0) {
      e.preventDefault();
      setActive((selected + 1) % results.length);
    } else if (e.key === 'ArrowUp' && results.length > 0) {
      e.preventDefault();
      setActive((selected - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && results[selected]) {
      e.preventDefault();
      onPicked(results[selected].pubkey);
    }
  };

  return (
    <div className="border-b border-lc-border bg-lc-card/30 p-3" data-testid="dm-composer-search">
      <div className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-black px-2.5 focus-within:border-lc-green">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-lc-muted" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <Input
          variant="bare"
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          placeholder={t('dm.compose.placeholder')}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="dm-compose-results"
          aria-label={t('dm.newMessage')}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-lc-white outline-none placeholder:text-lc-muted"
          data-testid="dm-compose-input"
        />
        {loading && <span className="lc-spinner h-3.5 w-3.5 shrink-0" role="status" aria-label={t('shell.search.searching')} />}
        <CloseButton
          size="sm"
          onClick={onClose}
          label={t('shell.search.close')}
          title={t('shell.search.close')}
          className="text-lc-white/70 hover:bg-white/5"
        />
      </div>
      {searching && (
        <div id="dm-compose-results" role="listbox" className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
          {results.map((hit, i) => (
            <ResultRow
              key={hit.pubkey}
              hit={hit}
              active={i === selected}
              onPick={() => onPicked(hit.pubkey)}
              onHover={() => setActive(i)}
            />
          ))}
          {results.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-lc-muted" role="status">
              {loading ? t('shell.search.searching') : t('shell.search.noMatches')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
