#!/usr/bin/env node
// One-shot: ask configured relays to delete the bot's previous kind 9 hello
// messages. Reads BOT_NSEC + BOT_GROUPS from the same .env.local the price
// bot uses, fetches every kind 9 the bot ever published whose content
// matches the hello template, and publishes a kind 5 (NIP-09 deletion
// request) tagging each one.
//
// Usage:
//   node --env-file-if-exists=.env.local scripts/bot-cleanup-hellos.mjs
//
// Relay support is patchy — some honor kind 5 immediately, others ignore it
// and rely on clients to filter. Repeat-runs are safe (idempotent).

import { SimplePool, finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

function parseSecret(input) {
  const v = input.trim();
  if (v.startsWith('nsec1')) return nip19.decode(v).data;
  if (/^[0-9a-f]{64}$/i.test(v)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(v.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  throw new Error('BOT_NSEC must be nsec1... or 64-char hex');
}

const HELLO_PREFIX = '⚡ price bot online';
const TIMEOUT_MS = 8000;

if (!process.env.BOT_NSEC) { console.error('BOT_NSEC not set'); process.exit(1); }
const sk = parseSecret(process.env.BOT_NSEC);
const pk = getPublicKey(sk);

const groups = (process.env.BOT_GROUPS || '')
  .split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [relay, groupId] = s.split('|'); return { relay, groupId }; });
if (groups.length === 0) { console.error('BOT_GROUPS empty'); process.exit(1); }

const pool = new SimplePool({ automaticallyAuth: () => async (evt) => finalizeEvent(evt, sk) });

let totalDeleted = 0;

await Promise.all(groups.map(({ relay, groupId }) => new Promise((resolve) => {
  const targets = [];
  const sub = pool.subscribe(
    [relay],
    { kinds: [9], authors: [pk], '#h': [groupId] },
    {
      onauth: async () => null, // automaticallyAuth handles signing; presence of onauth suppresses default behavior
      onevent: (ev) => { if (ev.content.startsWith(HELLO_PREFIX)) targets.push(ev); },
      oneose: async () => {
        sub.close();
        if (targets.length === 0) {
          console.log(`[cleanup] ${relay} ${groupId.slice(0,8)} — no hellos found`);
          return resolve();
        }
        const tags = targets.map((ev) => ['e', ev.id]);
        tags.push(['k', '9']);
        const del = finalizeEvent(
          { kind: 5, created_at: Math.floor(Date.now() / 1000), tags, content: 'remove duplicate startup hellos' },
          sk,
        );
        try {
          await Promise.any(pool.publish([relay], del));
          totalDeleted += targets.length;
          console.log(`[cleanup] ${relay} ${groupId.slice(0,8)} — kind 5 published for ${targets.length} hello(s)`);
        } catch (err) {
          console.warn(`[cleanup] ${relay} kind 5 publish failed:`, err?.message || err);
        }
        resolve();
      },
    },
  );
  setTimeout(() => { sub.close(); resolve(); }, TIMEOUT_MS);
})));

console.log(`[cleanup] done. requested deletion of ${totalDeleted} event(s).`);
process.exit(0);
