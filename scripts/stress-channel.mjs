#!/usr/bin/env node
import fs from 'node:fs';
import { finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';

const KIND_GROUP_MESSAGE = 9;
const KIND_AUTH = 22242;

const blossomMedia = [
  'https://blossom.primal.net/0e9427163e6041c35f9422aeb29777d9d92d59a1d08911b7eb0c7fe81673e2ac.png',
  'https://blossom.primal.net/a1180fa2ed4387f66cdac6bdac4e729572dd8da17907f675b08b23414455fbeb.png',
  'https://blossom.primal.net/b70f7dc6fa5da5932adc9e98db589bbc4f569203aaef4070b2f858c495c54347.png',
  'https://blossom.primal.net/7adee2c6ff609530f074476ed1013ebd18c64bf029c546a21a0b3eaa263a692b.png',
  'https://blossom.primal.net/7ba87f923503325ee70c4d84a0f2e0c4daf4213a5e01e2f64eb67177ff1aa039.png',
];

const lorem = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Integer facilisis mauris a volutpat pharetra nibh justo suscipit magna.',
  'Suspendisse potenti curabitur mattis mi non eros luctus vitae placerat augue pulvinar.',
  'Donec viverra sapien ac massa dignissim sed tempor risus dictum.',
  'Praesent commodo justo id nulla dictum non luctus sem consequat.',
  'Curabitur tempor ex sed sapien cursus eu facilisis justo pretium.',
  'Etiam convallis nulla a arcu tempus vel fermentum arcu malesuada.',
  'Aenean lacinia velit vel libero faucibus nec varius nisl faucibus.',
];

function usage() {
  console.error('usage: node scripts/stress-channel.mjs <relay> <group-id> [count] [secret-file]');
  console.error('example: node scripts/stress-channel.mjs wss://relay.fabriok.ar demo-20260605t164122-general 1000 /home/pepe/obelisk-relay/config/settings.local.yml');
}

const relay = process.argv[2] ?? 'wss://relay.fabriok.ar';
const groupId = process.argv[3];
const count = Number.parseInt(process.argv[4] ?? '1000', 10);
const secretFile = process.argv[5] ?? '/home/pepe/obelisk-relay/config/settings.local.yml';

if (!groupId || !Number.isFinite(count) || count < 1) {
  usage();
  process.exit(2);
}

function hexToBytes(hex) {
  const clean = hex.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error('expected 32-byte hex secret');
  return Uint8Array.from(clean.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
}

function parseSecret(value) {
  const clean = value.trim();
  if (clean.startsWith('nsec')) return nip19.decode(clean).data;
  return hexToBytes(clean);
}

function readSecret() {
  if (process.env.OBELISK_STRESS_NSEC) return parseSecret(process.env.OBELISK_STRESS_NSEC);
  if (process.env.OBELISK_STRESS_PRIVATE_KEY_HEX) return parseSecret(process.env.OBELISK_STRESS_PRIVATE_KEY_HEX);
  const text = fs.readFileSync(secretFile, 'utf8');
  const match = text.match(/relay_secret_key:\s*["']?([^"'\s#]+)["']?/);
  if (!match) throw new Error(`relay_secret_key not found in ${secretFile}`);
  return parseSecret(match[1]);
}

function signAuth(challenge, secretKey) {
  return finalizeEvent({
    kind: KIND_AUTH,
    content: '',
    tags: [['relay', relay], ['challenge', challenge]],
    created_at: Math.floor(Date.now() / 1000),
  }, secretKey);
}

function buildContent(index, total) {
  const paragraph = [
    lorem[index % lorem.length],
    lorem[(index + 2) % lorem.length],
    lorem[(index + 5) % lorem.length],
  ].join(' ');
  const lines = [
    `Stress message ${String(index + 1).padStart(4, '0')} of ${total} for the main general channel.`,
    paragraph,
    `Scroll marker: load-test-${String(index + 1).padStart(4, '0')}.`,
  ];
  if (index % 50 === 0) lines.push(blossomMedia[(index / 50) % blossomMedia.length]);
  if (index % 125 === 0) lines.push('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  return lines.join('\n');
}

function buildEvents(secretKey) {
  const pubkey = getPublicKey(secretKey);
  const now = Math.floor(Date.now() / 1000);
  let previousId = null;
  const events = [];
  for (let index = 0; index < count; index += 1) {
    const tags = [
      ['h', groupId],
      ['t', 'stress-test'],
      ['client', 'obelisk-stress-channel'],
      ['p', pubkey],
    ];
    if (previousId && index % 7 === 0) tags.push(['e', previousId, relay, 'reply']);
    const event = finalizeEvent({
      kind: KIND_GROUP_MESSAGE,
      content: buildContent(index, count),
      tags,
      created_at: now - (count - index),
    }, secretKey);
    previousId = event.id;
    events.push(event);
  }
  return events;
}

class Publisher {
  constructor(events, secretKey) {
    this.events = events;
    this.secretKey = secretKey;
    this.ws = new WebSocket(relay);
    this.index = 0;
    this.accepted = 0;
    this.rejected = 0;
    this.inFlight = new Map();
    this.maxInFlight = 32;
    this.readyToPublish = false;
    this.authFallback = null;
    this.done = false;
    this.timeout = setTimeout(() => this.fail(new Error('publish timeout')), 180000);
  }

  run() {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.ws.addEventListener('open', () => this.startAuthProbe());
      this.ws.addEventListener('message', (message) => this.handleMessage(message));
      this.ws.addEventListener('error', () => this.fail(new Error('websocket error')));
      this.ws.addEventListener('close', () => {
        if (!this.done) this.fail(new Error('websocket closed before publish completed'));
      });
    });
  }

  handleMessage(message) {
    const frame = JSON.parse(String(message.data));
    if (frame[0] === 'AUTH') {
      this.ws.send(JSON.stringify(['AUTH', signAuth(frame[1], this.secretKey)]));
      this.ws.send(JSON.stringify(['CLOSE', 'stress-auth-probe']));
      this.readyToPublish = true;
      if (this.authFallback) clearTimeout(this.authFallback);
      this.pump();
      return;
    }
    if (frame[0] === 'EOSE' && frame[1] === 'stress-auth-probe' && !this.readyToPublish) {
      this.readyToPublish = true;
      if (this.authFallback) clearTimeout(this.authFallback);
      this.pump();
      return;
    }
    if (frame[0] !== 'OK') return;
    const id = frame[1];
    if (!this.inFlight.has(id)) return;
    this.inFlight.delete(id);
    if (frame[2]) this.accepted += 1;
    else {
      this.rejected += 1;
      console.error(`rejected ${id}: ${frame[3] ?? 'no reason'}`);
    }
    const completed = this.accepted + this.rejected;
    if (completed % 100 === 0 || completed === this.events.length) {
      console.log(`completed ${completed}/${this.events.length} accepted=${this.accepted} rejected=${this.rejected}`);
    }
    this.pump();
    this.maybeDone();
  }

  pump() {
    if (this.done || !this.readyToPublish || this.ws.readyState !== WebSocket.OPEN) return;
    while (this.index < this.events.length && this.inFlight.size < this.maxInFlight) {
      const event = this.events[this.index];
      this.index += 1;
      this.inFlight.set(event.id, event);
      this.ws.send(JSON.stringify(['EVENT', event]));
    }
  }

  startAuthProbe() {
    this.ws.send(JSON.stringify(['REQ', 'stress-auth-probe', { kinds: [KIND_GROUP_MESSAGE], '#h': [groupId], limit: 1 }]));
    this.authFallback = setTimeout(() => {
      this.readyToPublish = true;
      this.pump();
    }, 1500);
  }

  maybeDone() {
    if (this.index < this.events.length || this.inFlight.size > 0) return;
    this.done = true;
    clearTimeout(this.timeout);
    this.ws.close();
    this.resolve({ accepted: this.accepted, rejected: this.rejected });
  }

  fail(error) {
    if (this.done) return;
    this.done = true;
    clearTimeout(this.timeout);
    try {
      this.ws.close();
    } catch {
      // ignore close failures after network errors
    }
    this.reject(error);
  }
}

async function main() {
  const secretKey = readSecret();
  const events = buildEvents(secretKey);
  console.log(`Publishing ${events.length} stress messages to ${groupId} on ${relay}`);
  const result = await new Publisher(events, secretKey).run();
  console.log(JSON.stringify({ relay, groupId, count: events.length, ...result }, null, 2));
  if (result.rejected > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
