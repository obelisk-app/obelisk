// Parse a `/zap` slash command into a ZapTarget. Frontend-only — resolves
// recipients from the bridge's user-metadata cache and the current channel's
// member list, so any channel user (and any pubkey on the relay) can be
// zapped by name or npub.

import { formatPubkey, npubToHex } from '@nostr-wot/data';
import { getBridgeImpl } from '@/lib/nostr-bridge';
import type { ZapTarget } from '@/store/messageZap';

export interface ParsedMessage {
  id: string;
  pubkey: string;
}

export type ParseResult =
  | { ok: true; target: ZapTarget }
  | { ok: false; error: string };

/**
 * Accepted forms (all frontend-only):
 *   /zap                       → reply target, else last message from someone else
 *   /zap 100                   → same with default amount
 *   /zap <npub|nprofile|hex>   → that user's most recent message in channel
 *   /zap <…> 100               → with amount
 *   /zap @name                 → match channel member by display/profile name
 */
export function parseZapCommand(
  content: string,
  groupId: string,
  messages: ReadonlyArray<ParsedMessage>,
  myPubkey: string | null,
  replyingTo: ParsedMessage | null,
): ParseResult {
  const m = /^\/zap(?:\s+(.+))?$/i.exec(content.trim());
  if (!m) return { ok: false, error: 'Invalid /zap command.' };
  const args = (m[1] ?? '').trim().split(/\s+/).filter(Boolean);

  let amount: number | undefined;
  // Strip a trailing integer as the amount.
  if (args.length > 0 && /^\d+$/.test(args[args.length - 1])) {
    amount = parseInt(args.pop()!, 10);
  }
  const userToken = args.join(' ');

  const bridge = getBridgeImpl();
  const metadata = bridge?.userMetadata.get() ?? {};
  const memberList = bridge?.membersByGroup.get()[groupId] ?? [];

  let recipientPubkey: string | null = null;

  if (userToken) {
    const resolved = resolveRecipient(userToken, memberList, metadata);
    if (!resolved) return { ok: false, error: `Unknown user: ${userToken}` };
    recipientPubkey = resolved;
  } else if (replyingTo) {
    recipientPubkey = replyingTo.pubkey;
  } else {
    const last = [...messages].reverse().find((x) => x.pubkey !== myPubkey);
    recipientPubkey = last?.pubkey ?? null;
    if (!recipientPubkey) return { ok: false, error: 'No message to zap. Reply to one or pass an npub.' };
  }

  if (recipientPubkey === myPubkey) {
    return { ok: false, error: 'Cannot zap yourself.' };
  }

  // Find the message id to tag (`e`): explicit reply, else recipient's most
  // recent message in this channel. May be undefined → user-zap (no `e` tag).
  let messageId: string | undefined;
  if (replyingTo && replyingTo.pubkey === recipientPubkey) {
    messageId = replyingTo.id;
  } else {
    const last = [...messages].reverse().find((x) => x.pubkey === recipientPubkey);
    messageId = last?.id;
  }

  const meta = metadata[recipientPubkey];
  const displayName = meta?.displayName || meta?.name || formatPubkey(recipientPubkey);

  return {
    ok: true,
    target: {
      messageId,
      recipientPubkey,
      recipientLud16: meta?.lud16 ?? null,
      displayName,
      groupId,
      defaultAmountSats: amount,
    },
  };
}

function resolveRecipient(
  token: string,
  memberPubkeys: ReadonlyArray<string>,
  metadata: Record<string, { name?: string | null; displayName?: string | null }>,
): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // First pass: prefer an explicit identifier (npub/nprofile/hex) anywhere
  // in the input. This is defence-in-depth for older drafts whose mention
  // picker left a partial display name in front of the npub
  // (`dum nostr:npub1…`) — the npub is still authoritative, the orphan name
  // is composer cruft we can safely ignore.
  for (const piece of trimmed.split(/\s+/)) {
    const stripped = piece.replace(/^@/, '').replace(/^nostr:/, '');
    if (stripped.startsWith('npub1') || stripped.startsWith('nprofile1')) {
      const hex = npubToHex(stripped);
      if (hex) return hex;
    }
    if (/^[0-9a-f]{64}$/i.test(stripped)) return stripped.toLowerCase();
  }

  // Second pass: treat the whole input as a display-name query. Display
  // names can contain spaces, so we match against the joined input (sans a
  // leading `@`).
  const needle = trimmed.replace(/^@/, '').toLowerCase();
  if (!needle) return null;
  for (const pk of memberPubkeys) {
    const meta = metadata[pk];
    const candidates = [meta?.displayName, meta?.name].filter(Boolean) as string[];
    if (candidates.some((n) => n.toLowerCase() === needle)) return pk;
  }
  // Looser: substring match.
  for (const pk of memberPubkeys) {
    const meta = metadata[pk];
    const candidates = [meta?.displayName, meta?.name].filter(Boolean) as string[];
    if (candidates.some((n) => n.toLowerCase().includes(needle))) return pk;
  }
  return null;
}

