#!/usr/bin/env node
/**
 * SFU test peer — joins a `voice-sfu` channel as a synthetic participant.
 *
 * Authors a kind 25052 `start`, a kind 20078 presence beacon (so the dex
 * UI tiles us), and runs a real WebRTC peer with werift that streams an
 * ffmpeg-generated test pattern (video) + sine tone (audio) to the SFU.
 * The SFU then forwards us to every browser in the room — verify by
 * watching the test pattern + hearing the tone in your dex tab.
 *
 * Usage:
 *   node services/sfu/scripts/test-peer.mjs <channel-id> [...]
 *
 * Channel-id is the NIP-29 group id (16 hex). The script discovers the
 * SFU via kind 31313 advertisement on the configured relays.
 *
 * Reuses the dex / SFU env (TURN URL + credentials, force-relay) so the
 * peer matches whatever ICE policy the live deployment is on.
 */

import { spawn } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SimplePool, finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';
import {
  RTCPeerConnection,
  MediaStreamTrack,
  RtpPacket,
} from 'werift';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stateDir = path.join(__dirname, '..', '.test-peer');
mkdirSync(stateDir, { recursive: true });

// ── Config ──────────────────────────────────────────────────────────────
const CHANNEL_ID = process.argv[2];
if (!CHANNEL_ID || !/^[0-9a-f]+$/i.test(CHANNEL_ID)) {
  console.error('usage: node test-peer.mjs <channel-id-hex>');
  process.exit(1);
}

const RELAYS = (process.env.TEST_PEER_RELAYS ?? 'wss://public.obelisk.ar')
  .split(',').map((s) => s.trim()).filter(Boolean);
const TRUSTED_RELAYS = (process.env.TEST_PEER_TRUSTED_RELAYS ?? 'wss://relay.obelisk.ar,wss://public.obelisk.ar')
  .split(',').map((s) => s.trim()).filter(Boolean);
const TURN_URLS = (process.env.TEST_PEER_TURN_URLS ?? 'turn:89.167.77.78:3478,turn:89.167.77.78:3478?transport=tcp')
  .split(',').map((s) => s.trim()).filter(Boolean);
const TURN_USERNAME = process.env.TEST_PEER_TURN_USERNAME ?? 'obelisk';
const TURN_CREDENTIAL = process.env.TEST_PEER_TURN_CREDENTIAL ?? 'obelisk';
const FORCE_RELAY = (process.env.TEST_PEER_FORCE_RELAY ?? '1') === '1';

const VIDEO_RTP_PORT = 50100;
const AUDIO_RTP_PORT = 50102;

// ── Identity (persist across runs so the dex remembers us) ─────────────
const keyFile = path.join(stateDir, 'nsec.hex');
let privateKeyHex;
if (existsSync(keyFile)) {
  privateKeyHex = readFileSync(keyFile, 'utf8').trim();
} else {
  privateKeyHex = randomBytes(32).toString('hex');
  writeFileSync(keyFile, privateKeyHex);
}
const privateKey = Buffer.from(privateKeyHex, 'hex');
const pubkey = getPublicKey(privateKey);
const npub = nip19.npubEncode(pubkey);
console.log('[peer] npub=', npub);
console.log('[peer] pubkey=', pubkey);
console.log('[peer] channel=', CHANNEL_ID);

// ── Relay pool ─────────────────────────────────────────────────────────
const pool = new SimplePool();
const allRelays = Array.from(new Set([...RELAYS, ...TRUSTED_RELAYS]));

async function publish(template) {
  const ev = finalizeEvent({
    ...template,
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
  }, privateKey);
  const targets = ev.kind === 25052
    ? Array.from(new Set([...RELAYS, ...TRUSTED_RELAYS]))
    : RELAYS;
  const results = await Promise.allSettled(pool.publish(targets, ev));
  if (ev.kind === 25052) {
    results.forEach((r, i) => {
      console.log('[peer] publish 25052', targets[i],
        r.status, r.status === 'rejected' ? r.reason?.message : 'ok');
    });
  }
  return ev;
}

// ── SFU discovery (kind 31313) ─────────────────────────────────────────
function discoverSfu(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const ads = new Map();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sub.close();
      let best = null;
      for (const ad of ads.values()) if (!best || ad.created_at > best.created_at) best = ad;
      resolve(best);
    };
    const sub = pool.subscribe(allRelays, { kinds: [31313] }, {
      onevent: (ev) => {
        const existing = ads.get(ev.pubkey);
        if (existing && existing.created_at >= ev.created_at) return;
        ads.set(ev.pubkey, ev);
      },
      oneose: () => setTimeout(finish, 300),
    });
    setTimeout(finish, timeoutMs);
  });
}

// ── Main ────────────────────────────────────────────────────────────────
console.log('[peer] discovering SFU…');
const sfuAd = await discoverSfu();
if (!sfuAd) {
  console.error('[peer] no SFU advertisement found on', allRelays.join(','));
  process.exit(1);
}
const sfuPubkey = sfuAd.pubkey;
const sfuUrl = sfuAd.tags.find((t) => t[0] === 'url')?.[1] ?? '(unknown)';
console.log('[peer] SFU pubkey=', sfuPubkey, 'url=', sfuUrl);

// ── 1. Authorize the room ───────────────────────────────────────────────
async function publishStart() {
  await publish({
    kind: 25052,
    content: JSON.stringify({
      action: 'start',
      params: { video: true, screen: true, maxParticipants: 50 },
    }),
    tags: [
      ['p', sfuPubkey],
      ['e', CHANNEL_ID],
      ['t', 'obelisk-sfu-control'],
      ['expiration', String(Math.floor(Date.now() / 1000) + 60)],
    ],
  });
}
console.log('[peer] publishing kind 25052 start…');
await publishStart();

// Nuke any prior SFU-side peer for our pubkey before opening a fresh
// PC. Without this, a previously-stuck peer (have-local-offer with no
// answer) will keep dropping our new offers as glare. requestReset
// makes the SFU close + redial via its existing recovery path.
console.log('[peer] sending preemptive requestReset to clear stale SFU peer…');
await publish({
  kind: 25050,
  content: JSON.stringify({ type: 'requestReset', sessionId: 'pre-' + Date.now(), seq: 0 }),
  tags: [
    ['p', sfuPubkey],
    ['e', CHANNEL_ID],
    ['t', 'obelisk-voice-signal'],
  ],
});
await new Promise((r) => setTimeout(r, 1500));

// ── 2. WebRTC peer to the SFU ──────────────────────────────────────────
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  ...TURN_URLS.map((url) => ({
    urls: url,
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  })),
];

const pc = new RTCPeerConnection({
  iceServers,
  bundlePolicy: 'max-bundle',
  iceTransportPolicy: FORCE_RELAY ? 'relay' : 'all',
});

const sessionId = randomUUID().slice(0, 8);
let outboundSeq = 0;
let makingOffer = false;

const videoTrack = new MediaStreamTrack({ kind: 'video' });
const audioTrack = new MediaStreamTrack({ kind: 'audio' });

const videoTx = pc.addTransceiver('video', { direction: 'sendonly' });
await videoTx.sender.replaceTrack(videoTrack);

const audioTx = pc.addTransceiver('audio', { direction: 'sendonly' });
await audioTx.sender.replaceTrack(audioTrack);

// ── 3. Signaling round-trip via kind 25050 ─────────────────────────────
async function sendSignal(payload) {
  await publish({
    kind: 25050,
    content: JSON.stringify(payload),
    tags: [
      ['p', sfuPubkey],
      ['e', CHANNEL_ID],
      ['t', 'obelisk-voice-signal'],
    ],
  });
}

pc.onnegotiationneeded = async () => {
  if (makingOffer || pc.signalingState !== 'stable') return;
  try {
    makingOffer = true;
    await pc.setLocalDescription();
    if (pc.localDescription) {
      console.log('[peer] → offer (sdp', pc.localDescription.sdp.length, 'bytes)');
      await sendSignal({
        type: 'offer',
        sdp: pc.localDescription.sdp,
        sessionId,
        seq: ++outboundSeq,
      });
    }
  } finally {
    makingOffer = false;
  }
};

pc.onIceCandidate.subscribe(async (candidate) => {
  if (!candidate) return;
  await sendSignal({
    type: 'ice',
    candidates: [candidate.toJSON()],
    sessionId,
    seq: ++outboundSeq,
  });
});

pc.connectionStateChange.subscribe((state) => {
  console.log('[peer] connectionState =', state);
});
pc.iceConnectionStateChange.subscribe((state) => {
  console.log('[peer] iceConnectionState =', state);
});

// Send trackinfo so the SFU labels our tracks correctly.
async function announceTrack(track, kind) {
  await sendSignal({
    type: 'trackinfo',
    trackInfo: { trackId: track.uuid, kind },
    sessionId,
    seq: ++outboundSeq,
  });
}
await announceTrack(videoTrack, 'camera');
await announceTrack(audioTrack, 'audio');

// ── 4. Subscribe to inbound kind 25050 from the SFU ────────────────────
// Drop #p filter — some relays don't index it on ephemeral kinds; gate
// in handler instead. Subscribe broadly by author + channel.
const seenInbound = new Set();
pool.subscribe(allRelays, {
  kinds: [25050],
  '#e': [CHANNEL_ID],
  authors: [sfuPubkey],
  since: Math.floor(Date.now() / 1000) - 30,
}, {
  onevent: async (ev) => {
    const targetedAtUs = ev.tags.some((t) => t[0] === 'p' && t[1] === pubkey);
    if (!targetedAtUs) return;
    if (seenInbound.has(ev.id)) return;
    seenInbound.add(ev.id);
    let payload;
    try { payload = JSON.parse(ev.content); } catch { return; }
    console.log('[peer] ← signal type=' + payload.type + ' seq=' + payload.seq);
    try {
      if (payload.type === 'offer' && payload.sdp) {
        // Perfect-negotiation polite role: the SFU's werift can't roll
        // back, so this peer MUST always be polite (roll back its own
        // offer in flight) regardless of pubkey comparison. Without
        // this both sides drop each other's offer on glare and the PC
        // stays in have-local-offer forever.
        const offerCollision = makingOffer || pc.signalingState !== 'stable';
        if (offerCollision && pc.signalingState === 'have-local-offer') {
          try { await pc.setLocalDescription({ type: 'rollback' }); }
          catch (e) { console.warn('[peer] rollback threw', e.message); }
        }
        await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
        await pc.setLocalDescription();
        if (pc.localDescription) {
          await sendSignal({
            type: 'answer',
            sdp: pc.localDescription.sdp,
            sessionId,
            seq: ++outboundSeq,
          });
        }
      } else if (payload.type === 'answer' && payload.sdp) {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
        }
      } else if (payload.type === 'ice' && Array.isArray(payload.candidates)) {
        for (const c of payload.candidates) {
          try { await pc.addIceCandidate(c); } catch (e) { /* ignore stale */ }
        }
      }
    } catch (err) {
      console.warn('[peer] handleSignal threw', err.message);
    }
  },
});

// ── 5. Periodic kind 20078 presence beacon ─────────────────────────────
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
// Re-publish start every 4 minutes so the SFU room doesn't age out.
setInterval(() => publishStart().catch(() => undefined), 4 * 60_000);

// ── 6. ffmpeg → UDP RTP → werift writeRtp ──────────────────────────────
function pumpUdpToTrack(port, track, label) {
  let pktCount = 0;
  let lastLog = Date.now();
  const sock = createSocket('udp4');
  sock.on('message', (buf) => {
    try {
      const pkt = RtpPacket.deSerialize(buf);
      track.writeRtp(pkt);
      pktCount++;
      const now = Date.now();
      if (now - lastLog > 5000) {
        console.log('[peer]', label, 'RTP forwarded', pktCount, 'packets so far');
        lastLog = now;
      }
    } catch (e) {
      // Some bytes may not be RTP (RTCP); ignore.
    }
  });
  sock.bind(port, '127.0.0.1', () => {
    console.log('[peer]', label, 'RTP sink listening on 127.0.0.1:' + port);
  });
  return sock;
}
pumpUdpToTrack(VIDEO_RTP_PORT, videoTrack, 'video');
pumpUdpToTrack(AUDIO_RTP_PORT, audioTrack, 'audio');

// Periodic dump of sender state — verify codec was assigned by negotiation
// and that bytes are actually flowing out.
setInterval(() => {
  const vSender = videoTx.sender;
  const aSender = audioTx.sender;
  console.log('[peer] senders',
    'v={dtls=' + vSender.dtlsTransport?.state + ' codec=' + (vSender.codec?.payloadType ?? 'null') + ' pkts=' + vSender.packetCount + ' bytes=' + vSender.octetCount + '}',
    'a={dtls=' + aSender.dtlsTransport?.state + ' codec=' + (aSender.codec?.payloadType ?? 'null') + ' pkts=' + aSender.packetCount + ' bytes=' + aSender.octetCount + '}');
}, 5000);

// Spawn ffmpeg processes — RTP muxer is single-stream, so video and
// audio go through separate ffmpeg invocations.
const videoArgs = [
  '-loglevel', 'warning', '-re',
  '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=15',
  '-c:v', 'libvpx', '-b:v', '500k', '-deadline', 'realtime', '-cpu-used', '4',
  '-payload_type', '96',
  '-ssrc', '1',
  '-f', 'rtp', `rtp://127.0.0.1:${VIDEO_RTP_PORT}?pkt_size=1200`,
];
const audioArgs = [
  '-loglevel', 'warning', '-re',
  '-f', 'lavfi', '-i', 'sine=frequency=440:beep_factor=4',
  '-c:a', 'libopus', '-b:a', '32k',
  '-payload_type', '111',
  '-ssrc', '2',
  '-f', 'rtp', `rtp://127.0.0.1:${AUDIO_RTP_PORT}?pkt_size=1200`,
];
console.log('[peer] spawning ffmpeg (video)…');
const ffv = spawn('ffmpeg', videoArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
console.log('[peer] spawning ffmpeg (audio)…');
const ffa = spawn('ffmpeg', audioArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
const childExit = (label) => (code) => {
  console.log('[peer] ffmpeg', label, 'exited', code);
  if (code !== 0 && code !== null) process.exit(code);
};
ffv.on('exit', childExit('video'));
ffa.on('exit', childExit('audio'));

// Trigger the very first offer once both transceivers + track wiring are set.
queueMicrotask(async () => {
  if (pc.signalingState === 'stable') {
    try { await pc.setLocalDescription(); } catch {}
    if (pc.localDescription) {
      console.log('[peer] kicking initial offer');
      await sendSignal({
        type: 'offer',
        sdp: pc.localDescription.sdp,
        sessionId,
        seq: ++outboundSeq,
      });
    }
  }
});

process.on('SIGINT', () => {
  console.log('[peer] shutting down');
  ffv.kill();
  ffa.kill();
  pc.close();
  pool.close(allRelays);
  process.exit(0);
});

console.log('[peer] running. Ctrl-C to exit.');
