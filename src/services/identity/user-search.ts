import { NIP05_RE, type UserHit } from '@/constants/identity/user-search';

/** Resolve an explicitly typed NIP-05 identity; cancellation belongs to the caller. */
export async function resolveNip05(identifier: string, signal: AbortSignal): Promise<UserHit | null> {
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
    return { pubkey: pk.toLowerCase(), displayName: null, picture: null, nip05: identifier };
  } catch {
    return null;
  }
}

