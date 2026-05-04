#!/usr/bin/env node
/**
 * Publish a kind 25052 `start` event to bring an SFU call up on a channel.
 *
 *   node scripts/start-call.mjs <channelId>
 *   node scripts/start-call.mjs <channelId> --video=false --screen=true --max=20
 *
 * Reads `SFU_NSEC` from `services/sfu/.env` and signs with it. Because the
 * SFU's own pubkey acts as the operator when `SFU_OPERATOR_PUBKEY` is unset
 * (the default solo deploy), this bypasses the per-user allow-list — handy
 * for local testing without needing to add yourself to allow.json first.
 *
 * For a real-user test where the host should be another person, sign with
 * THEIR nsec via `nak event ...` instead. See services/sfu/README.md.
 */
import 'dotenv/config';
import { getPublicKey, finalizeEvent, SimplePool } from 'nostr-tools';
import { hexToBytes } from '@noble/hashes/utils.js';

function usage() {
  console.error('Usage: node scripts/start-call.mjs <channelId> [--video=true|false] [--screen=true|false] [--max=N]');
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length === 0 || args[0]?.startsWith('--')) usage();

const channelId = args[0];
// NIP-29 group ids are operator-defined; the dex uses 16-char hex (8 bytes).
// Accept any non-empty hex of reasonable length.
if (!/^[0-9a-f]{8,64}$/i.test(channelId)) {
  console.error('channelId must be hex (8–64 chars)');
  process.exit(2);
}

const flag = (name, fallback) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  if (!a) return fallback;
  const v = a.split('=', 2)[1];
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

const video = flag('video', true);
const screen = flag('screen', true);
const max = flag('max', 50);

const nsecHex = (process.env.SFU_NSEC ?? '').trim();
if (!/^[0-9a-f]{64}$/i.test(nsecHex)) {
  console.error('SFU_NSEC missing or invalid in .env. Run scripts/setup.sh first.');
  process.exit(1);
}
const sk = hexToBytes(nsecHex);
const sfuPubkey = getPublicKey(sk);

// Publish to BOTH general + trusted-author relays so the SFU's per-relay
// subscription sees the event on whichever path it has open. In a normal
// trusted-relay deploy, only the trusted relay matters for authorization,
// but publishing to the general relay too keeps things working when the
// user's account isn't whitelisted on the trusted relay (they fall back
// to the local allow.json check).
const relays = Array.from(new Set([
  ...(process.env.SFU_RELAYS ?? 'wss://public.obelisk.ar').split(','),
  ...(process.env.SFU_TRUSTED_AUTHOR_RELAYS ?? '').split(','),
]).values()).map((s) => s.trim()).filter(Boolean);

const now = Math.floor(Date.now() / 1000);
const template = {
  kind: 25052,
  created_at: now,
  tags: [
    ['p', sfuPubkey],
    ['e', channelId],
    ['t', 'obelisk-sfu-control'],
    ['expiration', String(now + 60)],
  ],
  content: JSON.stringify({
    action: 'start',
    params: {
      video,
      screen,
      maxParticipants: max,
    },
  }),
};

const event = finalizeEvent(template, sk);

console.log('Publishing kind 25052 start');
console.log('  SFU pubkey  :', sfuPubkey);
console.log('  channelId   :', channelId);
console.log('  rules       :', { video, screen, maxParticipants: max });
console.log('  relays      :', relays);
console.log();

const pool = new SimplePool();
const results = pool.publish(relays, event);
const settled = await Promise.allSettled(results);
let oks = 0;
settled.forEach((r, i) => {
  if (r.status === 'fulfilled') {
    oks++;
    console.log(`  ✓ ${relays[i]}`);
  } else {
    console.log(`  ✗ ${relays[i]}  ${r.reason?.message ?? r.reason}`);
  }
});
pool.close(relays);

if (oks === 0) {
  console.error('All relays rejected — check sfu.log and the relay URL.');
  process.exit(1);
}
console.log(`\nDone (${oks}/${settled.length} relays). Watch sfu.log for 'start accepted'.`);
