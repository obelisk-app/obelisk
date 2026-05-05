#!/usr/bin/env node
/**
 * Mediasoup-aware test peer.
 *
 * The legacy `test-peer.mjs` spoke werift over kind 25050 SDP/ICE; the
 * new SFU rejects that protocol. Instead of reimplementing mediasoup-client
 * in Node, this script:
 *
 *   1. Discovers the SFU via kind 31313 (same as the legacy test peer).
 *   2. Authors a kind 25052 `start` so the SFU spins up a Room.
 *   3. Authors a kind 20078 presence beacon so the dex shows us as a
 *      participant.
 *   4. Hits `POST /test/inject` on the SFU's HTTP endpoint to allocate a
 *      mediasoup PlainTransport per stream (audio + video).
 *   5. Spawns ffmpeg pipelines that send VP8 + opus RTP straight to the
 *      transport's RTP port. comedia=true on the transport means it binds
 *      to whatever IP we send from — no DTLS, no ICE.
 *
 * Once running, any browser in the same channel that has loaded the
 * dex's mediasoup-client `SfuClient` will see the producers via
 * `newProducer` notifications and consume them as normal tracks.
 *
 * Usage:
 *   node scripts/sfu-test-peers/test-peer-ms.mjs <channel-id-hex>
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SimplePool, finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';
import { generateSecretKey } from 'nostr-tools/pure';

// NIP-42 AUTH support — relay.obelisk.ar gates reads + writes on
// authenticated whitelisted pubkeys; without this the discovery sub
// gets rejected with "Auth required" and the script loops forever.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stateDir = path.join(__dirname, '..', '.test-peer-ms');
mkdirSync(stateDir, { recursive: true });

const CHANNEL_ID = process.argv[2];
if (!CHANNEL_ID || !/^[0-9a-f]+$/i.test(CHANNEL_ID)) {
  console.error('usage: node test-peer-ms.mjs <channel-id-hex>');
  process.exit(1);
}

const RELAYS = (process.env.TEST_PEER_RELAYS ?? 'wss://public.obelisk.ar')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Persistent identity so the dex remembers us between restarts.
const KEY_PATH = path.join(stateDir, 'identity.json');
let secretKey;
let pubkey;
if (existsSync(KEY_PATH)) {
  const raw = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  secretKey = Uint8Array.from(Buffer.from(raw.skHex, 'hex'));
  pubkey = raw.pubkey;
} else {
  secretKey = generateSecretKey();
  pubkey = getPublicKey(secretKey);
  writeFileSync(KEY_PATH, JSON.stringify({
    skHex: Buffer.from(secretKey).toString('hex'),
    pubkey,
    npub: nip19.npubEncode(pubkey),
  }, null, 2));
}
console.log('[test-ms] pubkey=', pubkey);
console.log('[test-ms] npub=', nip19.npubEncode(pubkey));
console.log('[test-ms] channel=', CHANNEL_ID);

const pool = new SimplePool({
  automaticallyAuth: () => (template) => Promise.resolve(finalizeEvent(template, secretKey)),
});

function publish(template) {
  const ev = finalizeEvent({ ...template, created_at: Math.floor(Date.now() / 1000) }, secretKey);
  return Promise.allSettled(pool.publish(RELAYS, ev));
}

// ── 1. SFU identity ────────────────────────────────────────────────────
// Two paths: env override (skip discovery, useful when the relay doesn't
// store kind 31313) or relay-discovered. The discovery query targets
// `RELAYS`, but a NIP-29 groups relay only stores group-related kinds, so
// kind 31313 events written there are forwarded once and gone.
let sfuAd;
if (process.env.SFU_PUBKEY && process.env.SFU_URL) {
  sfuAd = { pubkey: process.env.SFU_PUBKEY, url: process.env.SFU_URL };
  console.log('[test-ms] SFU from env (skipping discovery)');
} else {
  console.log('[test-ms] discovering SFU on', RELAYS.join(','), '…');
  sfuAd = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sub.close();
      reject(new Error('no kind 31313 advertisement seen in 10s'));
    }, 10_000);
    const sub = pool.subscribe(
      RELAYS,
      { kinds: [31313], limit: 5 },
      {
        onevent(ev) {
          const url = ev.tags.find((t) => t[0] === 'url')?.[1];
          if (!url) return;
          clearTimeout(timeout);
          sub.close();
          resolve({ pubkey: ev.pubkey, url });
        },
      },
    );
  });
}
console.log('[test-ms] SFU pubkey=', sfuAd.pubkey, 'url=', sfuAd.url);

// ── 1.5. Publish kind 0 profile metadata ───────────────────────────────
// So the dex's participant tile shows a real name + avatar instead of a
// bare hex pubkey. Same shape the price bot uses.
console.log('[test-ms] publishing kind 0 profile…');
await publish({
  kind: 0,
  content: JSON.stringify({
    name: 'SFU Test Peer',
    display_name: 'SFU Test Peer',
    about: 'Synthetic ffmpeg producer (testsrc2 + 440 Hz sine) used to smoke-test the Obelisk mediasoup SFU end-to-end.',
    // Generic "TV signal / test pattern" icon so it reads as "this is a test source".
    picture: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/SMPTE_Color_Bars.svg/320px-SMPTE_Color_Bars.svg.png',
    bot: true,
  }),
  tags: [],
});

// ── 2. Publish kind 25052 start ────────────────────────────────────────
console.log('[test-ms] publishing kind 25052 start…');
await publish({
  kind: 25052,
  content: JSON.stringify({ action: 'start', params: { video: true, screen: true, maxParticipants: 50 } }),
  tags: [
    ['p', sfuAd.pubkey],
    ['e', CHANNEL_ID],
    ['t', 'obelisk-sfu-control'],
    ['expiration', String(Math.floor(Date.now() / 1000) + 60)],
  ],
});

// Wait for the room to be ready — `injectTestProducer` requires an
// active room. We just give the SFU 2s to receive the start event,
// validate it, and instantiate the room.
await new Promise((r) => setTimeout(r, 2_000));

// ── 3. Periodic kind 20078 beacon ──────────────────────────────────────
async function publishBeacon() {
  await publish({
    kind: 20078,
    content: '',
    tags: [
      ['e', CHANNEL_ID],
      ['t', 'obelisk-voice-presence'],
      ['expiration', String(Math.floor(Date.now() / 1000) + 30)],
      ['v', 'camera'],
    ],
  });
}
await publishBeacon();
setInterval(publishBeacon, 15_000);
// Re-publish start so the SFU room doesn't age out if no real users join.
setInterval(() => {
  void publish({
    kind: 25052,
    content: '',
    tags: [
      ['p', sfuAd.pubkey],
      ['e', CHANNEL_ID],
      ['action', 'start'],
      ['t', 'obelisk-sfu-control'],
      ['expiration', String(Math.floor(Date.now() / 1000) + 60)],
    ],
  }).catch(() => undefined);
}, 4 * 60_000);

// ── 4. POST /test/inject for video + audio ─────────────────────────────
async function inject(kind, voiceKind) {
  const url = `${sfuAd.url.replace(/\/$/, '')}/test/inject`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      channelId: CHANNEL_ID,
      kind,
      voiceKind,
      originPubkey: pubkey,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`inject ${kind} failed (${res.status}): ${text}`);
  return JSON.parse(text);
}

console.log('[test-ms] injecting video producer…');
const video = await inject('video', 'camera');
console.log('[test-ms] video transport →', video.rtpListenIp + ':' + video.rtpListenPort, 'pt=', video.payloadType, 'ssrc=', video.ssrc);

console.log('[test-ms] injecting audio producer…');
const audio = await inject('audio', 'audio');
console.log('[test-ms] audio transport →', audio.rtpListenIp + ':' + audio.rtpListenPort, 'pt=', audio.payloadType, 'ssrc=', audio.ssrc);

// ── 5. ffmpeg → mediasoup PlainTransport ───────────────────────────────
const videoArgs = [
  '-loglevel', 'warning', '-re',
  '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=15',
  '-c:v', 'libvpx', '-b:v', '500k', '-deadline', 'realtime', '-cpu-used', '4',
  // 1s GOP — viewers joining mid-stream see frames within 1 s.
  '-g', '15', '-keyint_min', '15',
  '-payload_type', String(video.payloadType),
  '-ssrc', String(video.ssrc),
  '-f', 'rtp', `rtp://${video.rtpListenIp}:${video.rtpListenPort}?pkt_size=1200`,
];
const audioArgs = [
  '-loglevel', 'warning', '-re',
  '-f', 'lavfi', '-i', 'sine=frequency=440:beep_factor=4',
  '-c:a', 'libopus', '-b:a', '32k',
  '-payload_type', String(audio.payloadType),
  '-ssrc', String(audio.ssrc),
  '-f', 'rtp', `rtp://${audio.rtpListenIp}:${audio.rtpListenPort}?pkt_size=1200`,
];

console.log('[test-ms] spawning ffmpeg (video)…');
const ffv = spawn('ffmpeg', videoArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
console.log('[test-ms] spawning ffmpeg (audio)…');
const ffa = spawn('ffmpeg', audioArgs, { stdio: ['ignore', 'inherit', 'inherit'] });

ffv.on('exit', (code) => console.log('[test-ms] ffmpeg video exited', code));
ffa.on('exit', (code) => console.log('[test-ms] ffmpeg audio exited', code));

console.log('[test-ms] running. Ctrl-C to exit.');

// Periodic stats so pm2 logs show progress.
let lastReport = Date.now();
setInterval(() => {
  const elapsed = Math.floor((Date.now() - lastReport) / 1000);
  console.log('[test-ms] still running — uptime', elapsed, 's');
}, 30_000);

const cleanup = () => {
  console.log('[test-ms] shutting down');
  try { ffv.kill('SIGTERM'); } catch { /* ignore */ }
  try { ffa.kill('SIGTERM'); } catch { /* ignore */ }
  try { pool.close(RELAYS); } catch { /* ignore */ }
  setTimeout(() => process.exit(0), 500);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
