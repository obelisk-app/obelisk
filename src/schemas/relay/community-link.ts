import { parseInviteLink } from '@applesauce/concord/helpers';
import { cleanInviteCode, inviteLinkRelay } from '@/utils/relay/relay-invite';
import { normalizeRelayInput } from '@/utils/relay-url/relay-url-input';

type CommunityLink =
  | { kind: 'concord'; url: string }
  | { kind: 'relay-invite'; code: string; relay: string }
  | { kind: 'relay'; url: string };

/** Check invitation links before allowing an address to reach the relay input parser. */
export function parseCommunityLink(raw: string): CommunityLink | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.username || url.password) return null;
      const match = /^\/(?:en\/|es\/|pt\/)?invite\/([^/]+)\/?$/.exec(url.pathname);
      if (!match) return null;
      if (match[1].startsWith('naddr1')) {
        parseInviteLink(value);
        return { kind: 'concord', url: value };
      }
      const code = cleanInviteCode(match[1]);
      if (!code || url.hash) return null;
      return { kind: 'relay-invite', code, relay: inviteLinkRelay(url.searchParams.get('relay') ?? undefined) };
    } catch {
      return null;
    }
  }
  if (/^(?!wss?:\/\/)[a-z][\w+.-]*:\/\//i.test(value) || value.includes('#')) return null;
  const url = normalizeRelayInput(value);
  if (!url) return null;
  const parsed = new URL(url);
  if (parsed.username || parsed.password) return null;
  return { kind: 'relay', url };
}
