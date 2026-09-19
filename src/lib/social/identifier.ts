/**
 * Parsing shareable Nostr identifiers.
 *
 * Isomorphic on purpose: the public viewer resolves the identifier on the
 * server (so link previews work) and the client island re-resolves it when
 * the server's bounded query came up empty. Both need the same parse, and a
 * `server-only` module can't be imported by a client component.
 */

import { nip19 } from 'nostr-tools';

export type ViewerTarget =
  | { kind: 'event'; id: string; relays: string[] }
  | { kind: 'address'; identifier: string; pubkey: string; eventKind: number; relays: string[] }
  | { kind: 'profile'; pubkey: string; relays: string[] };

/**
 * Accepts every spelling people actually paste: bare 64-char hex, `note1`,
 * `nevent1`, `naddr1`, `npub1`, `nprofile1`, with or without a `nostr:`
 * prefix.
 */
export function parseIdentifier(raw: string): ViewerTarget | null {
  let value: string;
  try {
    value = decodeURIComponent(raw).trim().replace(/^nostr:/i, '');
  } catch {
    value = raw.trim().replace(/^nostr:/i, '');
  }
  if (!value) return null;

  if (/^[0-9a-f]{64}$/i.test(value)) {
    return { kind: 'event', id: value.toLowerCase(), relays: [] };
  }

  try {
    const decoded = nip19.decode(value);
    switch (decoded.type) {
      case 'note':
        return { kind: 'event', id: decoded.data, relays: [] };
      case 'nevent':
        return { kind: 'event', id: decoded.data.id, relays: decoded.data.relays ?? [] };
      case 'naddr':
        return {
          kind: 'address',
          identifier: decoded.data.identifier,
          pubkey: decoded.data.pubkey,
          eventKind: decoded.data.kind,
          relays: decoded.data.relays ?? [],
        };
      case 'npub':
        return { kind: 'profile', pubkey: decoded.data, relays: [] };
      case 'nprofile':
        return { kind: 'profile', pubkey: decoded.data.pubkey, relays: decoded.data.relays ?? [] };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Only `wss:` to public hosts. A relay hint travels inside a user-supplied
 * identifier, so it is attacker-controlled: without this a crafted link could
 * aim a server-side socket at the host's own network.
 */
export function safeRelayHints(hints: readonly string[], max = 3): string[] {
  const out: string[] = [];
  for (const hint of hints) {
    try {
      const url = new URL(hint);
      if (url.protocol !== 'wss:') continue;
      const host = url.hostname.toLowerCase();
      if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.onion')) continue;
      if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/.test(host)) continue;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) continue;
      out.push(url.toString().replace(/\/$/, ''));
    } catch {
      // Ignore unparseable hints rather than failing the whole request.
    }
    if (out.length >= max) break;
  }
  return out;
}
