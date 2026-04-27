'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';
import { npubToHex, formatPubkey } from '@/lib/nostr';
import { useProfile, useNostrQuery } from '@/lib/nostr-hooks';
import type { UserSearchResult } from '@/app/api/users/search/route';

interface DMComposerProps {
  onClose: () => void;
  /** Optional fallback display name/picture for direct-paste pubkeys that
   *  haven't shown up on relays yet. Mirrors the legacy `profileCache` map
   *  the modal used to take. */
  profileCache?: Map<string, { name?: string; picture?: string }>;
}

interface RowProfile {
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05?: string | null;
}

const SEARCH_DEBOUNCE_MS = 250;
// NIP-50 search isn't universally supported; query a couple of indexers in
// parallel so a flaky single relay doesn't silently kill the whole feature.
const NIP50_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.noswhere.com',
  'wss://search.nos.today',
];

function resolveToHex(input: string): string | null {
  return input.trim() ? npubToHex(input) : null;
}

function parseKind0Content(raw: string): { name?: string; displayName?: string; picture?: string; nip05?: string } {
  try {
    const r = JSON.parse(raw);
    return {
      name: r.name,
      displayName: r.displayName ?? r.display_name,
      picture: r.picture ?? r.image,
      nip05: r.nip05,
    };
  } catch {
    return {};
  }
}

const NIP05_RE = /^([a-z0-9._-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i;

interface Nip05Hit {
  pubkey: string;
  identifier: string;
}

async function resolveNip05(identifier: string, signal: AbortSignal): Promise<Nip05Hit | null> {
  const m = NIP05_RE.exec(identifier.trim());
  if (!m) return null;
  const [, name, domain] = m;
  try {
    const res = await fetch(
      `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`,
      { signal, mode: 'cors' },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { names?: Record<string, string> };
    const pk = data.names?.[name] ?? data.names?.[name.toLowerCase()];
    if (typeof pk !== 'string' || !/^[0-9a-f]{64}$/i.test(pk)) return null;
    return { pubkey: pk.toLowerCase(), identifier };
  } catch {
    return null;
  }
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function ResultRow({
  profile,
  badge,
  onClick,
}: {
  profile: RowProfile;
  badge?: string;
  onClick: () => void;
}) {
  const name = profile.displayName ?? formatPubkey(profile.pubkey);
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-lc-border/40 transition-colors text-left"
      data-testid="dm-search-result"
      data-pubkey={profile.pubkey}
    >
      {profile.picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
          {(name[0] || '?').toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-lc-white truncate">{name}</span>
          {badge && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-lc-green/15 text-lc-green border border-lc-green/30 shrink-0">
              {badge}
            </span>
          )}
        </div>
        {profile.nip05 ? (
          <p className="text-[11px] text-lc-muted truncate">{profile.nip05}</p>
        ) : (
          <p className="text-[11px] text-lc-muted truncate font-mono">{formatPubkey(profile.pubkey)}</p>
        )}
      </div>
    </button>
  );
}

export default function DMComposer({ onClose, profileCache }: DMComposerProps) {
  const [pubkey, setPubkey] = useState('');
  const [error, setError] = useState('');

  const { addThread, setActiveDM } = useDMStore();
  const myPubkey = useAuthStore((s) => s.profile?.pubkey ?? null);

  const partnerHex = useMemo(() => resolveToHex(pubkey), [pubkey]);
  const profileEntry = useProfile(myPubkey, partnerHex);

  const trimmed = pubkey.trim();
  const debouncedQuery = useDebounced(trimmed, SEARCH_DEBOUNCE_MS);
  const searchEnabled = debouncedQuery.length >= 2 && !partnerHex;

  const [obeliskResults, setObeliskResults] = useState<UserSearchResult[]>([]);
  const [obeliskLoading, setObeliskLoading] = useState(false);
  const [nip05Hit, setNip05Hit] = useState<Nip05Hit | null>(null);
  const [nip05Loading, setNip05Loading] = useState(false);

  // Treat `name@domain.tld` as a NIP-05 lookup. We resolve it via the
  // standard `.well-known/nostr.json` endpoint — that's the only way to
  // pull the hex pubkey for a NIP-05 the local DB doesn't know about, and
  // NIP-50 free-text search on relays is unreliable for nip-05 strings.
  useEffect(() => {
    setNip05Hit(null);
    if (!searchEnabled || !NIP05_RE.test(debouncedQuery)) {
      setNip05Loading(false);
      return;
    }
    const ac = new AbortController();
    setNip05Loading(true);
    resolveNip05(debouncedQuery, ac.signal).then((hit) => {
      if (ac.signal.aborted) return;
      setNip05Hit(hit);
      setNip05Loading(false);
    });
    return () => { ac.abort(); setNip05Loading(false); };
  }, [debouncedQuery, searchEnabled]);

  // Pull the kind-0 profile for a resolved NIP-05 hit so we can render an
  // avatar + display name instead of just the bare pubkey.
  const nip05Profile = useProfile(myPubkey, nip05Hit?.pubkey ?? null);

  useEffect(() => {
    if (!searchEnabled) {
      setObeliskResults([]);
      setObeliskLoading(false);
      return;
    }
    let cancelled = false;
    setObeliskLoading(true);
    fetch(`/api/users/search?q=${encodeURIComponent(debouncedQuery)}`, {
      credentials: 'same-origin',
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('search failed'))))
      .then((data: { results: UserSearchResult[] }) => {
        if (cancelled) return;
        setObeliskResults(data.results ?? []);
        setObeliskLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setObeliskResults([]);
        setObeliskLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery, searchEnabled]);

  const nostrFilters = useMemo(
    () => (searchEnabled ? [{ kinds: [0], search: debouncedQuery, limit: 10 }] : []),
    [debouncedQuery, searchEnabled],
  );
  const { events: nostrEvents, loading: nostrLoading } = useNostrQuery(nostrFilters, {
    enabled: searchEnabled,
    relays: NIP50_RELAYS,
    // NIP-50 indexers can be slow on cold connect; give them headroom before
    // we declare "no relay matches yet" instead of "still searching".
    timeoutMs: 10000,
  });

  const obeliskPubkeys = useMemo(
    () => new Set(obeliskResults.map((r) => r.pubkey)),
    [obeliskResults],
  );

  const nostrResults = useMemo<RowProfile[]>(() => {
    const out: RowProfile[] = [];
    const seen = new Set<string>();
    for (const ev of nostrEvents) {
      if (ev.kind !== 0) continue;
      if (seen.has(ev.pubkey)) continue;
      if (obeliskPubkeys.has(ev.pubkey)) continue;
      if (myPubkey && ev.pubkey === myPubkey) continue;
      seen.add(ev.pubkey);
      const parsed = parseKind0Content(ev.content);
      out.push({
        pubkey: ev.pubkey,
        displayName: parsed.displayName ?? parsed.name ?? null,
        picture: parsed.picture ?? null,
        nip05: parsed.nip05 ?? null,
      });
      if (out.length >= 10) break;
    }
    return out;
  }, [nostrEvents, obeliskPubkeys, myPubkey]);

  const startChatWith = (pk: string, profile?: { displayName?: string | null; picture?: string | null }) => {
    addThread({
      pubkey: pk,
      displayName: profile?.displayName ?? pk.slice(0, 8) + '...',
      picture: profile?.picture ?? undefined,
      unreadCount: 0,
    });
    setActiveDM(pk);
    onClose();
  };

  const handleStart = () => {
    const pk = resolveToHex(pubkey);
    // Enter is a no-op when the input isn't a parseable pubkey — the user is
    // probably mid-search. The Start button is only rendered next to a valid
    // preview row, so reaching this branch via the button is impossible.
    if (!pk) return;
    const liveParsed = partnerHex === pk ? profileEntry?.parsed : undefined;
    const legacy = profileCache?.get(pk);
    const displayName = liveParsed?.displayName ?? liveParsed?.name ?? legacy?.name ?? pk.slice(0, 8) + '...';
    const picture = liveParsed?.picture ?? legacy?.picture;
    startChatWith(pk, { displayName, picture });
  };

  const previewParsed = profileEntry?.parsed;
  const previewName = previewParsed?.displayName ?? previewParsed?.name;
  const previewPicture = previewParsed?.picture;

  const showSearchSections = searchEnabled;
  const nip05Row: RowProfile | null = nip05Hit && !obeliskPubkeys.has(nip05Hit.pubkey)
    ? {
        pubkey: nip05Hit.pubkey,
        displayName: nip05Profile?.parsed?.displayName ?? nip05Profile?.parsed?.name ?? null,
        picture: nip05Profile?.parsed?.picture ?? null,
        nip05: nip05Hit.identifier,
      }
    : null;
  const noResults =
    showSearchSections &&
    !obeliskLoading &&
    !nostrLoading &&
    !nip05Loading &&
    !nip05Row &&
    obeliskResults.length === 0 &&
    nostrResults.length === 0;

  return (
    <div
      className="absolute left-0 right-0 z-20 flex flex-col bg-lc-dark/95 backdrop-blur-sm border-b border-lc-border shadow-lg"
      data-testid="dm-composer"
    >
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <input
            type="text"
            value={pubkey}
            onChange={(e) => { setPubkey(e.target.value); setError(''); }}
            placeholder="Search by name, nip-05, npub or hex"
            className="w-full pl-3 pr-9 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm placeholder:text-lc-muted focus:border-lc-green focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            autoFocus
            data-testid="new-dm-pubkey-input"
          />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-lc-muted hover:text-lc-white hover:bg-lc-border/60 transition-colors"
            aria-label="Close search"
            data-testid="dm-composer-cancel"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {partnerHex && (
          <div
            className="flex items-center gap-2.5 mt-2 p-2 rounded-lg bg-lc-black/60 border border-lc-border"
            data-testid="new-dm-preview"
          >
            {previewPicture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewPicture} alt="" className="w-7 h-7 rounded-full object-cover" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-lc-border" />
            )}
            <span className="text-sm text-lc-white truncate flex-1">
              {previewName ?? formatPubkey(partnerHex)}
            </span>
            <button
              onClick={handleStart}
              className="lc-pill-primary px-3 py-1 text-xs font-medium shrink-0"
              data-testid="start-dm-btn"
            >
              Start
            </button>
          </div>
        )}
        {error && <p className="text-xs text-red-400 mt-2" data-testid="new-dm-error">{error}</p>}
      </div>

      {showSearchSections && (
        <div className="max-h-72 overflow-y-auto px-2 pt-1 pb-2 border-t border-lc-border bg-lc-black/30" data-testid="dm-search-results">
          {(nip05Loading || nip05Row) && (
            <section className="mb-2" data-testid="dm-search-nip05-section">
              <header className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
                  NIP-05 lookup
                </span>
                {nip05Loading && (
                  <span className="text-[10px] text-lc-muted">Resolving…</span>
                )}
              </header>
              {nip05Row && (
                <ResultRow
                  profile={nip05Row}
                  badge="NIP-05"
                  onClick={() => startChatWith(nip05Row.pubkey, { displayName: nip05Row.displayName, picture: nip05Row.picture })}
                />
              )}
            </section>
          )}
          <section className="mb-2">
            <header className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
                On Obelisk
              </span>
              {obeliskLoading && (
                <span className="text-[10px] text-lc-muted" data-testid="dm-search-obelisk-loading">
                  Searching…
                </span>
              )}
            </header>
            {obeliskResults.length === 0 && !obeliskLoading ? (
              <p className="px-1 text-xs text-lc-muted">No matches in this instance</p>
            ) : (
              <div className="flex flex-col" data-testid="dm-search-obelisk-results">
                {obeliskResults.map((r) => (
                  <ResultRow
                    key={`obelisk-${r.pubkey}`}
                    profile={r}
                    badge="On Obelisk"
                    onClick={() => startChatWith(r.pubkey, { displayName: r.displayName, picture: r.picture })}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <header className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
                On Nostr
              </span>
              {nostrLoading && (
                <span className="text-[10px] text-lc-muted" data-testid="dm-search-nostr-loading">
                  Searching…
                </span>
              )}
            </header>
            {nostrResults.length === 0 && !nostrLoading ? (
              <p className="px-1 text-xs text-lc-muted">No relay matches yet</p>
            ) : (
              <div className="flex flex-col" data-testid="dm-search-nostr-results">
                {nostrResults.map((r) => (
                  <ResultRow
                    key={`nostr-${r.pubkey}`}
                    profile={r}
                    onClick={() => startChatWith(r.pubkey, { displayName: r.displayName, picture: r.picture })}
                  />
                ))}
              </div>
            )}
          </section>

          {noResults && (
            <p className="px-1 mt-2 text-xs text-lc-muted" data-testid="dm-search-empty">
              Nothing found. Paste an npub or hex pubkey to message anyone directly.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
