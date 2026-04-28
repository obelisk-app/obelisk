'use client';

/**
 * DM composer — paste an npub/hex pubkey or NIP-05 to start a conversation.
 * Drops obelisk's API user-search; keeps NIP-05 resolution since that's
 * pure-protocol.
 */

import { useEffect, useState } from 'react';

const NIP05_RE = /^([a-z0-9._-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i;

async function resolveNip05(identifier: string, signal: AbortSignal): Promise<string | null> {
  const m = NIP05_RE.exec(identifier.trim());
  if (!m) return null;
  const [, name, domain] = m;
  try {
    const res = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, { signal, mode: 'cors' });
    if (!res.ok) return null;
    const data = (await res.json()) as { names?: Record<string, string> };
    const pk = data.names?.[name] ?? data.names?.[name.toLowerCase()];
    if (typeof pk !== 'string' || !/^[0-9a-f]{64}$/i.test(pk)) return null;
    return pk.toLowerCase();
  } catch {
    return null;
  }
}

export default function DMComposer({
  onClose,
  onPicked,
}: {
  onClose: () => void;
  onPicked: (pubkeyHex: string) => void;
}) {
  const [input, setInput] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Auto-resolve npub / hex / NIP-05
  useEffect(() => {
    setErr(null);
    setResolved(null);
    const v = input.trim();
    if (!v) return;

    if (/^[0-9a-f]{64}$/i.test(v)) {
      setResolved(v.toLowerCase());
      return;
    }
    if (v.startsWith('npub1')) {
      let cancelled = false;
      (async () => {
        try {
          const { nip19 } = await import('nostr-tools');
          const dec = nip19.decode(v);
          if (cancelled) return;
          if (dec.type === 'npub') setResolved(dec.data as string);
          else setErr('Not an npub');
        } catch (e) {
          if (!cancelled) setErr((e as Error).message);
        }
      })();
      return () => { cancelled = true; };
    }
    if (NIP05_RE.test(v)) {
      const ac = new AbortController();
      setResolving(true);
      resolveNip05(v, ac.signal)
        .then((pk) => {
          if (ac.signal.aborted) return;
          if (pk) setResolved(pk);
          else setErr('NIP-05 not found');
        })
        .catch(() => setErr('NIP-05 lookup failed'))
        .finally(() => setResolving(false));
      return () => ac.abort();
    }
  }, [input]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolved) return;
    onPicked(resolved);
  }

  return (
    <form onSubmit={submit} className="border-b border-lc-border bg-lc-card/30 p-3">
      <input
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="npub1…, hex, or alice@example.com"
        spellCheck={false}
        className="w-full rounded border border-lc-border bg-lc-black px-2 py-1.5 font-mono text-xs text-lc-white outline-none focus:border-lc-green"
      />
      <div className="mt-2 flex items-center justify-between text-[10px]">
        <span className={resolved ? 'text-lc-green' : err ? 'text-red-400' : 'text-lc-muted'}>
          {resolving ? 'Resolving NIP-05…' : resolved ? `→ ${resolved.slice(0, 24)}…` : err ?? ' '}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="text-lc-muted hover:text-lc-white">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!resolved}
            className="rounded bg-lc-green px-2 py-0.5 font-semibold text-lc-black disabled:opacity-40"
          >
            Start
          </button>
        </div>
      </div>
    </form>
  );
}
