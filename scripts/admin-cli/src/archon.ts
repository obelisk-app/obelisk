import { nip19 } from 'nostr-tools';
import { loadServerMemory } from './memory';

/**
 * Serialize a hex pubkey into the mention token understood by
 * src/lib/mentions.ts (`(?:nostr:)?npub1[bech32]`).
 */
export function mentionToken(pubkeyHex: string): string {
  return `nostr:${nip19.npubEncode(pubkeyHex)}`;
}

/**
 * Find which cached server owns `channelId`. Returns null if the caller
 * hasn't synced any server containing it — the command surface tells them
 * to `servers sync` first.
 */
export function findServerForChannel(channelId: string): { serverId: string; channelName: string } | null {
  // Naive scan across cached server memories. Fast in practice: a handful of
  // servers, a few hundred channels at most.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const { MEMORY_DIR } = require('./memory') as typeof import('./memory');
  try {
    const files = fs.readdirSync(MEMORY_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const mem = loadServerMemory(f.replace(/\.json$/, ''));
      if (!mem) continue;
      const channel = mem.channels.find((c) => c.id === channelId);
      if (channel) return { serverId: mem.serverId, channelName: channel.name };
    }
  } catch { /* no memory dir yet */ }
  return null;
}

/**
 * Compose Archon's "this belongs elsewhere" suggestion. We lean on the
 * app's own markdown + mention rendering rather than fancy formatting —
 * the goal is one short, readable line.
 */
export function composeSuggestion(params: {
  targetChannelName: string;
  targetChannelId: string;
  authorMention?: string;
  reason?: string;
}): string {
  const who = params.authorMention ? `${params.authorMention} ` : '';
  const base = `🔷 **Archon:** ${who}este mensaje encaja mejor en **#${params.targetChannelName}**.`;
  const tail = params.reason ? ` ${params.reason.trim()}` : '';
  return base + tail;
}

/**
 * Compose the alert posted to owners/admins when something looks
 * significantly wrong. Mentions are appended at the end so the readable
 * line comes first in notifications.
 */
export function composeAlert(params: {
  summary: string;
  mentions: string[]; // hex pubkeys of owner + admins to notify
  link?: string; // optional deep-link to the offending message
}): string {
  const head = `⚠️ **Archon alert:** ${params.summary.trim()}`;
  const link = params.link ? `\n${params.link}` : '';
  const pings = params.mentions.length > 0
    ? '\n' + params.mentions.map(mentionToken).join(' ')
    : '';
  return head + link + pings;
}
