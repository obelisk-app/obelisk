#!/usr/bin/env node
import fs from 'node:fs';
import { finalizeEvent, nip19 } from 'nostr-tools';

const relay = process.argv[2] ?? 'wss://relay.fabriok.ar';
const namespace = process.argv[3];
const secretFile = process.argv[4] ?? '/home/pepe/obelisk-relay/config/settings.local.yml';
if (!namespace) {
  console.error('usage: node scripts/audit-seed.mjs <relay> <namespace> [secret-file]');
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

const seen = [];
let layoutChannelIds = [];
let phase = 'layout';
const ws = new WebSocket(relay);
let finishTimer = null;
let metadataTimer = null;
const timeout = setTimeout(() => {
  console.error('timeout');
  finish();
}, 30000);

function dTag(ev) {
  return ev.tags.find((tag) => tag[0] === 'd')?.[1] ?? null;
}

function hTag(ev) {
  return ev.tags.find((tag) => tag[0] === 'h')?.[1] ?? null;
}

function finish() {
  clearTimeout(timeout);
  if (finishTimer) clearTimeout(finishTimer);
  if (metadataTimer) clearTimeout(metadataTimer);
  const events = [...new Map(seen.map((ev) => [ev.id, ev])).values()];
  const meta = events.filter((ev) => ev.kind === 39000 && dTag(ev)?.startsWith(`${namespace}-`));
  const createEvents = events.filter((ev) => ev.kind === 9007 && hTag(ev)?.startsWith(`${namespace}-`));
  const editEvents = events.filter((ev) => ev.kind === 9002 && hTag(ev)?.startsWith(`${namespace}-`));
  const messages = events.filter((ev) => ev.kind === 9 && hTag(ev)?.startsWith(`${namespace}-`));
  const layout = events.find((ev) => ev.kind === 30078 && dTag(ev) === `obelisk:layout:${relay}`);
  const layoutChannels = layout ? layout.tags.filter((tag) => tag[0] === 'channel').map((tag) => tag[1]) : layoutChannelIds;
  const roots = meta.filter((ev) => !ev.tags.some((tag) => tag[0] === 'parent'));
  const children = meta.filter((ev) => ev.tags.some((tag) => tag[0] === 'parent'));
  const forumContainers = meta.filter((ev) => ev.tags.some((tag) => tag[0] === 't' && tag[1] === 'forum'));
  const categoryByChannel = new Map(layout ? layout.tags.filter((tag) => tag[0] === 'channel').map((tag) => [tag[1], tag[2]]) : []);
  const rootsMissingCategory = roots.map(dTag).filter((id) => id && !categoryByChannel.has(id));
  const childrenInLayout = children.map(dTag).filter((id) => id && categoryByChannel.has(id));
  const sampleMessagesWithMedia = messages
    .filter((ev) => /https:\/\/[^ \n]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^ \n]*)?/i.test(ev.content))
    .slice(0, 5)
    .map((ev) => ({ group: hTag(ev), id: ev.id, media: ev.content.match(/https:\/\/[^ \n]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^ \n]*)?/i)?.[0] }));

  console.log(JSON.stringify({
    relay,
    namespace,
    eventCount: events.length,
    metadata39000: meta.length,
    create9007: createEvents.length,
    edit9002: editEvents.length,
    roots: roots.length,
    children: children.length,
    forumContainers: forumContainers.length,
    messages: messages.length,
    layout: layout ? {
      id: layout.id,
      author: layout.pubkey,
      categories: layout.tags.filter((tag) => tag[0] === 'category').length,
      channelRefs: layoutChannels.length,
    } : null,
    rootsMissingCategory,
    childrenReferencedByLayout: childrenInLayout.length,
    sampleMessagesWithMedia,
  }, null, 2));
  ws.close();
}

function scheduleFinish() {
  if (finishTimer) clearTimeout(finishTimer);
  finishTimer = setTimeout(finish, 2500);
}

function requestLayout() {
  phase = 'layout';
  ws.send(JSON.stringify(['REQ', 'audit-layout',
    { kinds: [30078], '#d': [`obelisk:layout:${relay}`], limit: 5 },
  ]));
}

function requestExactSeedData() {
  if (layoutChannelIds.length === 0) {
    scheduleFinish();
    return;
  }
  phase = 'data';
  ws.send(JSON.stringify(['REQ', 'audit-data',
    { kinds: [9002, 9007], '#h': layoutChannelIds, limit: 500 },
    { kinds: [39000], '#d': layoutChannelIds, limit: 500 },
    { kinds: [9], '#h': layoutChannelIds, limit: 1000 },
  ]));
  scheduleFinish();
}

ws.addEventListener('open', () => {
  requestLayout();
});

ws.addEventListener('message', (message) => {
  const frame = JSON.parse(String(message.data));
  if (frame[0] === 'AUTH') {
    ws.send(JSON.stringify(['AUTH', signAuth(frame[1])]));
    requestLayout();
    return;
  }
  if (frame[0] === 'EVENT') {
    seen.push(frame[2]);
    if (frame[2].kind === 30078 && dTag(frame[2]) === `obelisk:layout:${relay}`) {
      layoutChannelIds = frame[2].tags.filter((tag) => tag[0] === 'channel').map((tag) => tag[1]);
    }
    if (phase === 'data') scheduleFinish();
  }
  if (frame[0] === 'EOSE') {
    if (phase === 'layout') {
      if (metadataTimer) clearTimeout(metadataTimer);
      metadataTimer = setTimeout(requestExactSeedData, 700);
    } else {
      scheduleFinish();
    }
  }
});

ws.addEventListener('error', () => {
  console.error('websocket error');
  process.exit(1);
});
