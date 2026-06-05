#!/usr/bin/env node
import fs from 'node:fs';
import { finalizeEvent, nip19 } from 'nostr-tools';

const relay = process.argv[2] ?? 'wss://relay.fabriok.ar';
const namespace = process.argv[3];
const secretFile = process.argv[4] ?? '/home/pepe/obelisk-relay/config/settings.local.yml';
if (!namespace) {
  console.error('usage: node /tmp/verify-seed.mjs <relay> <namespace> [secret-file]');
  process.exit(2);
}

function hexToBytes(hex) {
  const clean = hex.trim().replace(/^0x/, '');
  return Uint8Array.from(clean.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
}

function parseSecret(value) {
  const clean = value.trim();
  if (clean.startsWith('nsec')) return nip19.decode(clean).data;
  return hexToBytes(clean);
}

const text = fs.readFileSync(secretFile, 'utf8');
const match = text.match(/relay_secret_key:\s*["']?([^"'\s#]+)["']?/);
if (!match) throw new Error('relay_secret_key not found');
const secretKey = parseSecret(match[1]);

function signAuth(challenge) {
  return finalizeEvent({
    kind: 22242,
    content: '',
    tags: [['relay', relay], ['challenge', challenge]],
    created_at: Math.floor(Date.now() / 1000),
  }, secretKey);
}

const general = `${namespace}-general`;
const forum = `${namespace}-forum-ideas`;
const thread = `${namespace}-thread-index-bootstrap`;

const filters = [
  { kinds: [9007, 9002], '#h': [general, forum, thread], limit: 20 },
  { kinds: [30078], '#h': [general], limit: 10 },
  { kinds: [9], '#h': [general], limit: 50 },
  { kinds: [7], '#h': [general], limit: 20 },
];

const seen = [];
let doneTimer = null;
const ws = new WebSocket(relay);
const timeout = setTimeout(() => {
  console.error('timeout');
  ws.close();
  process.exit(1);
}, 15000);

ws.addEventListener('open', () => {
  ws.send(JSON.stringify(['REQ', 'verify-seed', ...filters]));
});

ws.addEventListener('message', (message) => {
  const frame = JSON.parse(String(message.data));
  if (frame[0] === 'AUTH') {
    ws.send(JSON.stringify(['AUTH', signAuth(frame[1])]));
    ws.send(JSON.stringify(['REQ', 'verify-seed-auth', ...filters]));
    return;
  }
  if (frame[0] === 'EVENT') {
    seen.push(frame[2]);
    return;
  }
  if (frame[0] === 'EOSE') {
    if (!doneTimer) {
      doneTimer = setTimeout(() => {
        clearTimeout(timeout);
        const deduped = [...new Map(seen.map((ev) => [ev.id, ev])).values()];
        const blossomImages = deduped
          .flatMap((ev) => String(ev.content ?? '').match(/https:\/\/[^ \n]+blossom[^ \n]+\.(?:png|jpg|jpeg|gif|webp)/gi) ?? []);
        const byKind = deduped.reduce((acc, ev) => {
          acc[ev.kind] = (acc[ev.kind] ?? 0) + 1;
          return acc;
        }, {});
        const dTags = [...new Set(deduped.flatMap((ev) => ev.tags.filter((tag) => tag[0] === 'd').map((tag) => tag[1])))].sort();
        const pTags = [...new Set(deduped.flatMap((ev) => ev.tags.filter((tag) => tag[0] === 'p').map((tag) => tag[1])))];
        console.log(JSON.stringify({
          relay,
          namespace,
          count: deduped.length,
          byKind,
          dTags,
          groupIds: [...new Set(deduped.flatMap((ev) => ev.tags.filter((tag) => tag[0] === 'h').map((tag) => tag[1])))].sort(),
          blossomImageCount: blossomImages.length,
          mentionPubkeyCount: pTags.length,
        }, null, 2));
        ws.close();
      }, 800);
    }
  }
});

ws.addEventListener('error', () => {
  clearTimeout(timeout);
  console.error('websocket error');
  process.exit(1);
});
