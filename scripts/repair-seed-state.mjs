#!/usr/bin/env node
import fs from 'node:fs';
import { finalizeEvent, nip19 } from 'nostr-tools';

const KIND_AUTH = 22242;
const KIND_GROUP_CREATE = 9007;
const KIND_GROUP_EDIT_METADATA = 9002;
const KIND_GROUP_ADD_USER = 9000;
const KIND_GROUP_METADATA = 39000;
const KIND_GROUP_ADMINS = 39001;
const KIND_GROUP_MEMBERS = 39002;
const KIND_LAYOUT = 30078;

const relay = process.argv[2] ?? 'wss://relay.fabriok.ar';
const namespace = process.argv[3];
const secretFile = process.argv[4] ?? '/home/pepe/obelisk-relay/config/settings.local.yml';

if (!namespace) {
  console.error('usage: node scripts/repair-seed-state.mjs <relay> <namespace> [secret-file]');
  process.exit(2);
}

function hexToBytes(hex) {
  const clean = hex.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error('Secret must be nsec or 64 hex chars');
  return Uint8Array.from(clean.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
}

function parseSecret(value) {
  const clean = value.trim();
  if (clean.startsWith('nsec')) return nip19.decode(clean).data;
  return hexToBytes(clean);
}

function loadSecret() {
  const direct = process.env.OBELISK_SEED_NSEC || process.env.OBELISK_SEED_PRIVATE_KEY_HEX;
  if (direct) return parseSecret(direct);
  const text = fs.readFileSync(secretFile, 'utf8');
  const match = text.match(/relay_secret_key:\s*["']?([^"'\s#]+)["']?/);
  if (!match) throw new Error(`No relay_secret_key found in ${secretFile}`);
  return parseSecret(match[1]);
}

const secretKey = loadSecret();

function sign(kind, tags, content, createdAt) {
  return finalizeEvent({ kind, tags, content, created_at: createdAt }, secretKey);
}

function signAuth(challenge) {
  return sign(KIND_AUTH, [['relay', relay], ['challenge', challenge]], '', Math.floor(Date.now() / 1000));
}

function hTag(ev) {
  return ev.tags.find((tag) => tag[0] === 'h')?.[1] ?? null;
}

function dTag(ev) {
  return ev.tags.find((tag) => tag[0] === 'd')?.[1] ?? null;
}

function latestByGroup(events) {
  const map = new Map();
  for (const ev of events) {
    const id = hTag(ev) ?? dTag(ev);
    if (!id) continue;
    const prev = map.get(id);
    if (!prev || ev.created_at > prev.created_at) map.set(id, ev);
  }
  return map;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function queryRelay(filters, waitMs = 900) {
  const seen = [];
  const subId = `repair-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(relay);
    let doneTimer = null;
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`query timeout for ${subId}`));
    }, 20000);

    const sendReq = () => ws.send(JSON.stringify(['REQ', subId, ...filters]));
    const finish = () => {
      clearTimeout(timeout);
      if (doneTimer) clearTimeout(doneTimer);
      ws.close();
      resolve([...new Map(seen.map((ev) => [ev.id, ev])).values()]);
    };
    const scheduleFinish = () => {
      if (doneTimer) clearTimeout(doneTimer);
      doneTimer = setTimeout(finish, waitMs);
    };

    ws.addEventListener('open', sendReq);
    ws.addEventListener('message', (message) => {
      const frame = JSON.parse(String(message.data));
      if (frame[0] === 'AUTH') {
        ws.send(JSON.stringify(['AUTH', signAuth(frame[1])]));
        sendReq();
        return;
      }
      if (frame[0] === 'EVENT') {
        seen.push(frame[2]);
        scheduleFinish();
      }
      if (frame[0] === 'EOSE') scheduleFinish();
    });
    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error(`websocket error querying ${relay}`));
    });
  });
}

class Publisher {
  constructor() {
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(relay);
    this.ws.addEventListener('message', (message) => this.handleMessage(message));
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out connecting to ${relay}`)), 12000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.ws.addEventListener('error', () => reject(new Error(`Failed connecting to ${relay}`)), { once: true });
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  handleMessage(message) {
    const frame = JSON.parse(String(message.data));
    if (frame[0] === 'AUTH') {
      this.ws.send(JSON.stringify(['AUTH', signAuth(frame[1])]));
      return;
    }
    if (frame[0] !== 'OK') return;
    const [, id, accepted, reason] = frame;
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    if (accepted) pending.resolve();
    else pending.reject(new Error(String(reason || 'relay rejected event')));
  }

  publish(event, label) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(event.id);
        reject(new Error(`Timed out publishing ${label}`));
      }, 15000);
      this.pending.set(event.id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify(['EVENT', event]));
    });
  }

  close() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
  }
}

function metadataTagsFrom9002(groupId, editEvent) {
  const tags = [['d', groupId]];
  const keep = new Set(['name', 'about', 'picture', 'banner', 'public', 'private', 'open', 'closed', 'parent', 't', 'forum-tag', 'topic']);
  for (const tag of editEvent.tags) {
    if (tag[0] === 'h' || tag[0] === 'd') continue;
    if (keep.has(tag[0])) tags.push([...tag]);
  }
  if (!tags.some((tag) => tag[0] === 'public' || tag[0] === 'private')) tags.push(['public']);
  if (!tags.some((tag) => tag[0] === 'open' || tag[0] === 'closed')) tags.push(['open']);
  tags.push(['original_relay', relay]);
  tags.push(['nonbroadcast']);
  return tags;
}

function memberStateFor(groupId, putEvents, createEvent) {
  const members = new Map();
  if (createEvent?.pubkey) members.set(createEvent.pubkey, new Set(['admin']));
  for (const ev of putEvents) {
    if (hTag(ev) !== groupId) continue;
    for (const tag of ev.tags.filter((item) => item[0] === 'p' && item[1])) {
      const roles = new Set(tag.slice(2).map((role) => role.toLowerCase()));
      if (roles.size === 0) roles.add('member');
      const existing = members.get(tag[1]) ?? new Set();
      for (const role of roles) existing.add(role);
      members.set(tag[1], existing);
    }
  }
  const admins = [...members.entries()].filter(([, roles]) => roles.has('admin')).map(([pk]) => pk);
  if (admins.length === 0 && createEvent?.pubkey) {
    admins.push(createEvent.pubkey);
    members.set(createEvent.pubkey, new Set(['admin']));
  }
  return { admins: unique(admins), members: unique([...members.keys()]) };
}

async function main() {
  console.log(`Repairing relay state snapshots for ${namespace} on ${relay}`);
  const layoutEvents = await queryRelay([{ kinds: [KIND_LAYOUT], '#d': [`obelisk:layout:${relay}`], limit: 5 }]);
  const layout = layoutEvents
    .filter((ev) => dTag(ev) === `obelisk:layout:${relay}`)
    .sort((a, b) => b.created_at - a.created_at)[0];
  if (!layout) throw new Error('Layout event not found');

  const groupIds = layout.tags
    .filter((tag) => tag[0] === 'channel' && tag[1]?.startsWith(`${namespace}-`))
    .map((tag) => tag[1]);
  if (groupIds.length === 0) throw new Error(`No layout channel IDs found for ${namespace}`);
  console.log(`Layout references ${groupIds.length} seeded groups`);

  const managementEvents = [];
  const putEvents = [];
  for (const ids of chunk(groupIds, 10)) {
    managementEvents.push(...await queryRelay([{ kinds: [KIND_GROUP_CREATE, KIND_GROUP_EDIT_METADATA], '#h': ids, limit: 500 }]));
    putEvents.push(...await queryRelay([{ kinds: [KIND_GROUP_ADD_USER], '#h': ids, limit: 500 }]));
  }

  const edits = latestByGroup(managementEvents.filter((ev) => ev.kind === KIND_GROUP_EDIT_METADATA));
  const creates = latestByGroup(managementEvents.filter((ev) => ev.kind === KIND_GROUP_CREATE));
  console.log(`Found ${creates.size} create events, ${edits.size} edit metadata events, ${putEvents.length} member events`);

  const now = Math.floor(Date.now() / 1000);
  const repairEvents = [];
  let offset = 0;
  for (const groupId of groupIds) {
    const editEvent = edits.get(groupId);
    if (!editEvent) {
      console.warn(`Skipping ${groupId}: missing 9002 metadata`);
      continue;
    }
    const createEvent = creates.get(groupId);
    const state = memberStateFor(groupId, putEvents, createEvent);
    repairEvents.push({
      label: `39000 ${groupId}`,
      event: sign(KIND_GROUP_METADATA, metadataTagsFrom9002(groupId, editEvent), '', now + offset++),
    });
    repairEvents.push({
      label: `39001 ${groupId}`,
      event: sign(KIND_GROUP_ADMINS, [['d', groupId], ...state.admins.map((pk) => ['p', pk, 'Admin'])], '', now + offset++),
    });
    repairEvents.push({
      label: `39002 ${groupId}`,
      event: sign(KIND_GROUP_MEMBERS, [['d', groupId], ...state.members.map((pk) => ['p', pk])], '', now + offset++),
    });
  }

  console.log(`Publishing ${repairEvents.length} repair state events`);
  const publisher = new Publisher();
  await publisher.connect();
  try {
    for (let i = 0; i < repairEvents.length; i += 1) {
      await publisher.publish(repairEvents[i].event, repairEvents[i].label);
      if ((i + 1) % 50 === 0 || i + 1 === repairEvents.length) {
        console.log(`published ${i + 1}/${repairEvents.length}`);
      }
    }
  } finally {
    publisher.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
