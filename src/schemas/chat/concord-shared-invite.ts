import { parseInviteLink } from '@applesauce/concord/helpers';

export function parseConcordSharedInvite(custom: unknown, live: ReadonlySet<string>, now: number): string | null {
  if (!custom || typeof custom !== 'object' || !('obelisk' in custom)) return null;
  const settings = custom.obelisk;
  if (!settings || typeof settings !== 'object' || !('sharedInvite' in settings)) return null;
  const share = settings.sharedInvite;
  if (!share || typeof share !== 'object' || !('url' in share) || typeof share.url !== 'string') return null;
  if ('expiresAt' in share && (typeof share.expiresAt !== 'number' || share.expiresAt <= now)) return null;
  try {
    const url = new URL(share.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return live.has(parseInviteLink(share.url).linkSigner) ? share.url : null;
  } catch {
    return null;
  }
}
