'use client';

/**
 * Discord-style server rail. Mirrors obelisk's identity bar:
 *   ┌──┐
 *   │▶ │  ← DM tile (paper-airplane icon, first slot)
 *   └──┘
 *   ────  ← hairline separator
 *   [Ø]   ← relay tiles (one per configured relay)
 *   [+]   ← add-relay button
 *
 * Active item shows a green vertical pill on the left.
 * Tiles morph from rounded-square to circle on hover.
 */

import { useEffect, useState } from 'react';
import { nostrActions, useConfiguredRelays, useCurrentRelayUrl } from '@/lib/nostr-bridge';
import { faviconFor, fetchRelayInfo } from '@/lib/relay-info';

type RailMode = { kind: 'dm' } | { kind: 'relay'; url: string };

export default function ServerRail({
  mode,
  onPickDM,
  onPickRelay,
}: {
  mode: RailMode;
  onPickDM: () => void;
  onPickRelay: (url: string) => void;
}) {
  const relays = useConfiguredRelays();
  const currentRelay = useCurrentRelayUrl();
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-lc-black py-3">
      <RailTile
        active={mode.kind === 'dm'}
        title="Direct messages"
        onClick={onPickDM}
        icon={
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        }
        emphasis
      />

      <div className="my-1 h-px w-8 bg-lc-border" />

      {relays.map((url) => {
        const active = mode.kind === 'relay' && currentRelay === url;
        return (
          <RelayTile
            key={url}
            url={url}
            active={active}
            onClick={() => onPickRelay(url)}
            onRemove={() => {
              if (relays.length <= 1) return;
              if (confirm(`Remove relay ${shortHost(url)}?`)) nostrActions.removeRelay(url);
            }}
          />
        );
      })}

      <button
        onClick={() => setAdding(true)}
        title="Add relay"
        aria-label="Add relay"
        className="group/tile relative flex h-12 w-12 items-center justify-center rounded-2xl bg-lc-card text-lc-green ring-1 ring-lc-border transition-all duration-150 hover:rounded-xl hover:bg-lc-green/15 hover:ring-lc-green"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {adding && <AddRelayModal onClose={() => setAdding(false)} />}
    </div>
  );
}

function RailTile({
  active,
  title,
  onClick,
  icon,
  emphasis,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  icon: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="relative">
      <span
        className={
          'absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-lc-green transition-all ' +
          (active ? 'opacity-100' : 'opacity-0')
        }
      />
      <button
        onClick={onClick}
        title={title}
        aria-label={title}
        className={
          'group/tile relative flex h-12 w-12 items-center justify-center rounded-2xl ring-1 transition-all duration-150 hover:rounded-xl ' +
          (emphasis
            ? active
              ? 'bg-lc-green text-lc-black ring-lc-green'
              : 'bg-lc-olive/60 text-lc-green ring-lc-border hover:bg-lc-green hover:text-lc-black'
            : active
              ? 'bg-lc-green text-lc-black ring-lc-green'
              : 'bg-lc-card text-lc-white ring-lc-border hover:bg-lc-olive')
        }
      >
        {icon}
      </button>
    </div>
  );
}

function RelayTile({
  url,
  active,
  onClick,
  onRemove,
}: {
  url: string;
  active: boolean;
  onClick: () => void;
  onRemove: () => void;
}) {
  const host = shortHost(url);
  const initials = letterFor(host);
  const accent = colorFor(host);
  const [menu, setMenu] = useState(false);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [iconFailed, setIconFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchRelayInfo(url).then((info) => {
      if (!alive) return;
      setIconUrl(info?.icon || faviconFor(url));
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="relative">
      <span
        className={
          'absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-lc-green transition-all ' +
          (active ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-50')
        }
      />
      <button
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        title={url}
        aria-label={url}
        style={{ background: active ? accent : undefined, color: active ? '#0a0a0a' : '#fff' }}
        className={
          'group/tile relative flex h-12 w-12 items-center justify-center rounded-2xl font-bold text-base ring-1 transition-all duration-150 hover:rounded-xl ' +
          (active
            ? 'ring-lc-green'
            : 'bg-lc-card text-lc-white ring-lc-border hover:rounded-xl')
        }
      >
        {!active && (
          <span
            aria-hidden="true"
            style={{ background: accent }}
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-30 transition-opacity duration-150 group-hover/tile:opacity-60 group-hover/tile:rounded-xl"
          />
        )}
        {iconUrl && !iconFailed ? (
          <img
            src={iconUrl}
            alt=""
            onError={() => setIconFailed(true)}
            className="relative h-8 w-8 rounded-lg object-cover"
          />
        ) : (
          <span className="relative">{initials}</span>
        )}
      </button>
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
          <div className="absolute left-14 top-0 z-50 w-44 rounded-lg border border-lc-border bg-lc-dark p-1 shadow-2xl">
            <div className="px-3 py-2 text-[10px] font-mono text-lc-muted truncate">{url}</div>
            <button
              onClick={() => { setMenu(false); onClick(); }}
              className="block w-full rounded px-3 py-1.5 text-left text-sm text-lc-muted hover:bg-lc-card hover:text-lc-white"
            >
              Switch to relay
            </button>
            <button
              onClick={() => { setMenu(false); onRemove(); }}
              className="block w-full rounded px-3 py-1.5 text-left text-sm text-red-400 hover:bg-lc-card"
            >
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AddRelayModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('wss://');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    let v = url.trim();
    if (!v) return;
    if (!v.startsWith('ws://') && !v.startsWith('wss://')) v = 'wss://' + v.replace(/^\/*/, '');
    try {
      // Validate URL
      new URL(v);
    } catch {
      setErr('Invalid URL');
      return;
    }
    setBusy(true);
    try {
      await nostrActions.addRelay(v);
      await nostrActions.switchRelay(v);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="lc-card w-full max-w-md rounded-2xl border border-lc-border bg-lc-dark p-6 shadow-2xl"
      >
        <h2 className="text-lg font-bold text-lc-white">Add a relay</h2>
        <p className="mt-1 text-sm text-lc-muted">
          Paste a NIP-29 group relay URL. Each relay is a separate &ldquo;server&rdquo; in the rail.
        </p>
        <input
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          spellCheck={false}
          className="mt-4 w-full rounded border border-lc-border bg-lc-black px-3 py-2 font-mono text-sm text-lc-white outline-none focus:border-lc-green"
        />
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-lc-muted hover:text-lc-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="rounded-full bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
          >
            {busy ? 'Adding…' : 'Add relay'}
          </button>
        </div>
      </form>
    </div>
  );
}

// -- helpers ---------------------------------------------------------

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
function letterFor(host: string): string {
  const segs = host.split('.');
  const significant = segs.length >= 2 ? segs[segs.length - 2] : segs[0];
  return (significant[0] || '?').toUpperCase();
}
function colorFor(host: string): string {
  // Stable hash → hue; saturated, dark enough for white text.
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 60% 45%)`;
}
