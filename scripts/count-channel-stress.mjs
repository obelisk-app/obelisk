#!/usr/bin/env node
import fs from 'node:fs';
import { finalizeEvent, nip19 } from 'nostr-tools';

const relay = process.argv[2];
const groupId = process.argv[3];
const secretFile = process.argv[4] ?? '/home/pepe/obelisk-relay/config/settings.local.yml';

if (!relay || !groupId) {
  console.error('usage: node scripts/count-channel-stress.mjs <relay> <group-id> [secret-file]');
  process.exit(2);
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.trim().match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
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

const seen = new Map();
let currentPage = [];
let requestNumber = 0;
let activeSub = null;
let until = null;
let authed = false;
const pages = [];
const ws = new WebSocket(relay);
const timeout = setTimeout(() => {
  console.error('timeout');
  finish();
}, 45000);

function filterForPage() {
  const filter = {
    kinds: [9],
    '#h': [groupId],
    '#t': ['stress-test'],
    limit: 500,
  };
  if (until !== null) filter.until = until;
  return filter;
}

function requestPage() {
  requestNumber += 1;
  activeSub = `count-stress-${requestNumber}`;
  currentPage = [];
  ws.send(JSON.stringify(['REQ', activeSub, filterForPage()]));
}

function finish() {
  clearTimeout(timeout);
  const events = [...seen.values()];
  events.sort((a, b) => a.created_at - b.created_at);
  const oldestLine = events[0]?.content.split('\n')[0] ?? null;
  const newestLine = events.at(-1)?.content.split('\n')[0] ?? null;
  console.log(JSON.stringify({
    relay,
    groupId,
    stressMessagesVisible: events.length,
    pages,
    oldest: events[0]?.created_at ?? null,
    newest: events.at(-1)?.created_at ?? null,
    sampleOldest: oldestLine,
    sampleNewest: newestLine,
  }, null, 2));
  ws.close();
}

function completePage() {
  if (activeSub) ws.send(JSON.stringify(['CLOSE', activeSub]));
  currentPage.sort((a, b) => a.created_at - b.created_at);
  const oldest = currentPage[0]?.created_at ?? null;
  const newest = currentPage.at(-1)?.created_at ?? null;
  pages.push({ page: requestNumber, count: currentPage.length, oldest, newest });
  if (currentPage.length >= 500 && oldest !== null && requestNumber < 10) {
    until = oldest - 1;
    requestPage();
  } else {
    setTimeout(finish, 500);
  }
}

ws.addEventListener('open', () => {
  requestPage();
});

ws.addEventListener('message', (message) => {
  const frame = JSON.parse(String(message.data));
  if (frame[0] === 'AUTH') {
    ws.send(JSON.stringify(['AUTH', signAuth(frame[1])]));
    authed = true;
    requestPage();
    return;
  }
  if (frame[0] === 'EVENT' && frame[1] === activeSub) {
    seen.set(frame[2].id, frame[2]);
    currentPage.push(frame[2]);
    return;
  }
  if (frame[0] === 'EOSE' && frame[1] === activeSub) completePage();
});

ws.addEventListener('error', () => {
  console.error('websocket error');
  process.exit(1);
});
