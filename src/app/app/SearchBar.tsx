'use client';

/**
 * Discord-style search bar that runs NIP-50 queries against the active relay.
 *
 * Filter token grammar (matches the dropdown options shown in the UI):
 *   from:<npub|hex>      → author filter
 *   in:<groupId>         → restrict to a NIP-29 group (`#h`)
 *   mentions:<npub|hex>  → `#p` filter
 *   has:link|image|file  → client-side content filter (link / image url / file-ish url)
 *
 * Anything outside tokens is sent as the NIP-50 `search` term. Relays without
 * NIP-50 support will still honour author / `#h` / `#p` / time filters.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  nostrActions,
  useGroups,
  useUserMetadata,
  type JsMessage,
} from '@/lib/nostr-bridge';

const HISTORY_KEY = 'obeliskord/search-history';
const HISTORY_MAX = 10;

interface ParsedQuery {
  query: string;
  authors: string[];
  mentions: string[];
  groupIds: string[];
  has: Array<'link' | 'image' | 'file'>;
}

function decodeNpub(s: string): string | null {
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  if (s.startsWith('npub1')) {
    try {
      // Lazy import — keeps initial bundle slim.
      const { nip19 } = require('nostr-tools');
      const decoded = nip19.decode(s);
      if (decoded.type === 'npub') return decoded.data as string;
    } catch { /* ignore */ }
  }
  return null;
}

function parseQuery(raw: string): ParsedQuery {
  const tokens = raw.match(/\S+/g) ?? [];
  const out: ParsedQuery = { query: '', authors: [], mentions: [], groupIds: [], has: [] };
  const remaining: string[] = [];
  for (const tk of tokens) {
    const m = tk.match(/^(from|in|mentions|has):(.+)$/i);
    if (!m) { remaining.push(tk); continue; }
    const key = m[1].toLowerCase();
    const val = m[2];
    if (key === 'from') {
      const hex = decodeNpub(val);
      if (hex) out.authors.push(hex);
    } else if (key === 'mentions') {
      const hex = decodeNpub(val);
      if (hex) out.mentions.push(hex);
    } else if (key === 'in') {
      out.groupIds.push(val);
    } else if (key === 'has') {
      const v = val.toLowerCase();
      if (v === 'link' || v === 'image' || v === 'file') out.has.push(v);
    }
  }
  out.query = remaining.join(' ').trim();
  return out;
}

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, HISTORY_MAX) : [];
  } catch { return []; }
}

function pushHistory(q: string) {
  if (typeof window === 'undefined') return;
  const trimmed = q.trim();
  if (!trimmed) return;
  const cur = loadHistory().filter((x) => x !== trimmed);
  const next = [trimmed, ...cur].slice(0, HISTORY_MAX);
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

function clearHistory() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}

export default function SearchBar({
  serverName,
  activeGroupId,
  onJump,
}: {
  serverName: string;
  activeGroupId: string | null;
  onJump?: (msg: JsMessage & { groupId: string | null }) => void;
}) {
  const [raw, setRaw] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ReadonlyArray<JsMessage & { groupId: string | null }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setHistory(loadHistory()); }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function runSearch(text: string) {
    setRaw(text);
    setOpen(true);
    setError(null);
    const parsed = parseQuery(text);
    if (!parsed.query && parsed.authors.length === 0 && parsed.mentions.length === 0 && parsed.has.length === 0) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const r = await nostrActions.searchMessages({
        query: parsed.query || undefined,
        authors: parsed.authors.length > 0 ? parsed.authors : undefined,
        mentions: parsed.mentions.length > 0 ? parsed.mentions : undefined,
        groupIds: parsed.groupIds.length > 0
          ? parsed.groupIds
          : activeGroupId ? [activeGroupId] : undefined,
        has: parsed.has.length > 0 ? parsed.has : undefined,
        limit: 30,
      });
      setResults(r);
      pushHistory(text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function applyFilter(token: string) {
    const next = raw.trim() ? `${raw.trim()} ${token}` : token;
    setRaw(next);
    setOpen(true);
  }

  return (
    <div ref={rootRef} className="relative">
      <form
        onSubmit={(e) => { e.preventDefault(); runSearch(raw); }}
        className="flex items-center gap-1.5 rounded-md border border-lc-border bg-lc-black/40 px-2 py-1 w-44 md:w-56 focus-within:border-lc-green/60"
      >
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={`Buscar ${serverName}`}
          className="flex-1 bg-transparent text-xs text-lc-white outline-none placeholder:text-lc-muted"
        />
        <button type="submit" className="text-lc-muted hover:text-lc-white" aria-label="Search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </form>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[420px] max-h-[70vh] overflow-y-auto rounded-xl border border-lc-border bg-lc-dark shadow-2xl z-50">
          {!raw.trim() ? (
            <FilterAndHistoryPane
              history={history}
              onPickFilter={applyFilter}
              onPickHistory={(h) => runSearch(h)}
              onClearHistory={() => { clearHistory(); setHistory([]); }}
            />
          ) : (
            <ResultsPane
              busy={busy}
              error={error}
              results={results}
              onPickFilter={applyFilter}
              onJump={(m) => { onJump?.(m); setOpen(false); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FilterAndHistoryPane({
  history, onPickFilter, onPickHistory, onClearHistory,
}: {
  history: string[];
  onPickFilter: (token: string) => void;
  onPickHistory: (q: string) => void;
  onClearHistory: () => void;
}) {
  return (
    <>
      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-b border-lc-border">Filtros</div>
      <FilterRow icon="👤" title="De un usuario específico" hint="from: usuario" onClick={() => onPickFilter('from:')} />
      <FilterRow icon="#" title="Enviado en un canal específico" hint="in: canal" onClick={() => onPickFilter('in:')} />
      <FilterRow icon="🔗" title="Incluye un tipo concreto de datos" hint="has: enlace, imagen o archivo" onClick={() => onPickFilter('has:link')} />
      <FilterRow icon="@" title="Menciona a un usuario en concreto" hint="mentions: usuario" onClick={() => onPickFilter('mentions:')} />
      {history.length > 0 && (
        <>
          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-t border-lc-border">
            <span>Historial</span>
            <button onClick={onClearHistory} className="text-lc-muted hover:text-lc-white" aria-label="Borrar historial">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
              </svg>
            </button>
          </div>
          {history.map((h) => (
            <button
              key={h}
              onClick={() => onPickHistory(h)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lc-white hover:bg-lc-card"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-muted">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="truncate">{h}</span>
            </button>
          ))}
        </>
      )}
    </>
  );
}

function FilterRow({ icon, title, hint, onClick }: { icon: string; title: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-lc-card">
      <span className="mt-0.5 w-6 text-center text-base text-lc-muted">{icon}</span>
      <span className="flex-1 min-w-0">
        <div className="text-sm text-lc-white">{title}</div>
        <div className="text-xs text-lc-muted">{hint}</div>
      </span>
    </button>
  );
}

function ResultsPane({ busy, error, results, onPickFilter, onJump }: {
  busy: boolean;
  error: string | null;
  results: ReadonlyArray<JsMessage & { groupId: string | null }>;
  onPickFilter: (token: string) => void;
  onJump: (m: JsMessage & { groupId: string | null }) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-b border-lc-border">
        <span>{busy ? 'Buscando…' : `Resultados · ${results.length}`}</span>
      </div>
      {error && <div className="px-3 py-2 text-xs text-red-400">{error}</div>}
      {!busy && results.length === 0 && !error && (
        <div className="px-3 py-6 text-center text-sm text-lc-muted">
          Sin resultados. Probá con otros filtros (from:, in:, mentions:, has:).
        </div>
      )}
      {results.map((m) => <ResultRow key={m.id} msg={m} onJump={() => onJump(m)} onAuthor={(pk) => onPickFilter(`from:${pk}`)} />)}
    </>
  );
}

function ResultRow({ msg, onJump, onAuthor }: {
  msg: JsMessage & { groupId: string | null };
  onJump: () => void;
  onAuthor: (pk: string) => void;
}) {
  const meta = useUserMetadata(msg.pubkey);
  const groups = useGroups();
  const groupName = useMemo(
    () => groups.find((g) => g.id === msg.groupId)?.name ?? msg.groupId?.slice(0, 8) ?? '?',
    [groups, msg.groupId],
  );
  const name = meta?.displayName || meta?.name || msg.pubkey.slice(0, 8);
  return (
    <div className="px-3 py-2 hover:bg-lc-card border-b border-lc-border/40 last:border-b-0">
      <div className="flex items-baseline gap-2 text-xs">
        <button onClick={() => onAuthor(msg.pubkey)} className="font-semibold text-lc-white hover:underline truncate">{name}</button>
        <span className="text-lc-muted">in</span>
        <span className="text-lc-green truncate">#{groupName}</span>
        <span className="ml-auto text-[10px] text-lc-muted">
          {new Date(msg.createdAt * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <button onClick={onJump} className="mt-0.5 block w-full text-left text-sm text-lc-white/90 line-clamp-2">{msg.content}</button>
    </div>
  );
}
