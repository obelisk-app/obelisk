/**
 * Names and faces for the app frame, resolved by the host (never by the app).
 *
 * Both profile tiers, like `useAuthor`: the bridge's group-relay metadata and
 * the social tier. The name follows the "keys are never labels" rule — display
 * name, then NIP-05, then a short npub, never raw hex. The avatar is fetched
 * here and handed over as a Blob so the app never learns a URL (a URL would be
 * a network request the app could use to leak data or track the user).
 */
import { getBridgeImpl } from '@/lib/nostr-bridge/client';
import { shortNpubLabel } from '@/lib/short-npub';
import { getSocialProfile } from '@/lib/social/profiles';

import type { HostParticipant } from './host';

const AVATAR_MAX_BYTES = 512 * 1024;
const avatarCache = new Map<string, Promise<Blob | undefined>>();

function metadataOf(pubkey: string): { name: string | null; picture: string | null } {
  const bridge = getBridgeImpl()?.userMetadata.get()[pubkey] ?? null;
  const social = getSocialProfile(pubkey) as { displayName?: string | null; name?: string | null; nip05?: string | null; picture?: string | null } | null;
  const name = bridge?.displayName || social?.displayName || bridge?.name || social?.name
    || bridge?.nip05 || social?.nip05 || null;
  return { name, picture: bridge?.picture || social?.picture || null };
}

async function fetchAvatar(url: string): Promise<Blob | undefined> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return undefined;
    const res = await fetch(u.href, { referrerPolicy: 'no-referrer', credentials: 'omit' });
    if (!res.ok) return undefined;
    const type = res.headers.get('content-type') ?? '';
    if (!/^image\/(png|jpeg|webp|gif|avif)/.test(type)) return undefined;
    const blob = await res.blob();
    return blob.size <= AVATAR_MAX_BYTES ? blob : undefined;
  } catch {
    return undefined; // CORS, network — a monogram is fine
  }
}

export async function resolvePerson(pubkey: string): Promise<HostParticipant> {
  void getBridgeImpl()?.ensureUserMetadata(pubkey);
  const { name, picture } = metadataOf(pubkey);
  let avatar: Blob | undefined;
  if (picture) {
    let p = avatarCache.get(picture);
    if (!p) { p = fetchAvatar(picture); avatarCache.set(picture, p); }
    avatar = await p;
  }
  return { pubkey, name: name?.slice(0, 64) || shortNpubLabel(pubkey), ...(avatar ? { avatar } : {}) };
}

export function resolvePeople(pubkeys: readonly string[]): Promise<HostParticipant[]> {
  return Promise.all(pubkeys.map(resolvePerson));
}
