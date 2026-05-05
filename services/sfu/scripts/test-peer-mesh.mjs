#!/usr/bin/env node
/**
 * Mesh test peer — joins a regular `voice` channel as a synthetic
 * participant streaming an ffmpeg test pattern + 440 Hz tone over
 * direct browser-to-browser WebRTC. No SFU involved.
 *
 * Discovers other participants from kind 20078 presence beacons and
 * opens one P2P RTCPeerConnection per remote pubkey. Publishes its own
 * beacon so other participants see it in the roster.
 *
 *   node test-peer-mesh.mjs <channel-id-hex>
 *
 * Reuses the persistent keypair under services/sfu/.test-peer/.
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

const CHANNEL_ID = process.argv[2];
if (!CHANNEL_ID || !/^[0-9a-f]+$/i.test(CHANNEL_ID)) {
  console.error('usage: node test-peer-mesh.mjs <channel-id-hex>');
  process.exit(1);
}

const RELAYS = (process.env.TEST_PEER_RELAYS ?? 'wss://public.obelisk.ar')
  .split(',').map((s) => s.trim()).filter(Boolean);
const TURN_URLS = (process.env.TEST_PEER_TURN_URLS ?? 'turn:89.167.77.78:3478,turn:89.167.77.78:3478?transport=tcp')
  .split(',').map((s) => s.trim()).filter(Boolean);
const TURN_USERNAME = process.env.TEST_PEER_TURN_USERNAME ?? 'obelisk';
const TURN_CREDENTIAL = process.env.TEST_PEER_TURN_CREDENTIAL ?? 'obelisk';

const VIDEO_RTP_PORT = 50104;
const AUDIO_RTP_PORT = 50106;

// ── Identity ──────────────────────────────────────────────────────────
const keyFile = path.join(stateDir, 'nsec.hex');
let privateKeyHex;
if (existsSync(keyFile)) privateKeyHex = readFileSync(keyFile, 'utf8').trim();
else { privateKeyHex = randomBytes(32).toString('hex'); writeFileSync(keyFile, privateKeyHex); }
const privateKey = Buffer.from(privateKeyHex, 'hex');
const myPubkey = getPublicKey(privateKey);
console.log('[mesh] npub=', nip19.npubEncode(myPubkey));
console.log('[mesh] pubkey=', myPubkey);
console.log('[mesh] channel=', CHANNEL_ID);

// ── Relay pool ────────────────────────────────────────────────────────
const pool = new SimplePool();

async function publish(template) {
  const ev = finalizeEvent({
    ...template,
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
  }, privateKey);
  await Promise.allSettled(pool.publish(RELAYS, ev));
  return ev;
}

// ── ffmpeg sources (shared across all peers we open) ───────────────────
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
      if (now - lastLog > 8000) {
        console.log('[mesh]', label, 'RTP forwarded', pktCount, 'packets');
        lastLog = now;
      }
    } catch (e) { /* RTCP / not RTP */ }
  });
  sock.bind(port, '127.0.0.1', () => {
    console.log('[mesh]', label, 'RTP sink listening on 127.0.0.1:' + port);
  });
  return sock;
}

const sharedVideoTrack = new MediaStreamTrack({ kind: 'video' });
const sharedAudioTrack = new MediaStreamTrack({ kind: 'audio' });
pumpUdpToTrack(VIDEO_RTP_PORT, sharedVideoTrack, 'video');
pumpUdpToTrack(AUDIO_RTP_PORT, sharedAudioTrack, 'audio');

const ffvArgs = [
  '-loglevel', 'warning', '-re',
  '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=15',
  '-c:v', 'libvpx', '-b:v', '500k', '-deadline', 'realtime', '-cpu-used', '4',
  '-payload_type', '96', '-ssrc', '1',
  '-f', 'rtp', `rtp://127.0.0.1:${VIDEO_RTP_PORT}?pkt_size=1200`,
];
const ffaArgs = [
  '-loglevel', 'warning', '-re',
  '-f', 'lavfi', '-i', 'sine=frequency=440:beep_factor=4',
  '-c:a', 'libopus', '-b:a', '32k',
  '-payload_type', '111', '-ssrc', '2',
  '-f', 'rtp', `rtp://127.0.0.1:${AUDIO_RTP_PORT}?pkt_size=1200`,
];
console.log('[mesh] spawning ffmpeg…');
const ffv = spawn('ffmpeg', ffvArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
const ffa = spawn('ffmpeg', ffaArgs, { stdio: ['ignore', 'inherit', 'inherit'] });
ffv.on('exit', (c) => console.log('[mesh] ffmpeg(video) exited', c));
ffa.on('exit', (c) => console.log('[mesh] ffmpeg(audio) exited', c));

// ── Peer table — one PC per remote pubkey ──────────────────────────────
const peers = new Map(); // remotePubkey -> { pc, makingOffer, sessionId, outboundSeq, polite }

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  ...TURN_URLS.map((url) => ({ urls: url, username: TURN_USERNAME, credential: TURN_CREDENTIAL })),
];

async function sendSignal(toPubkey, payload) {
  await publish({
    kind: 25050,
    content: JSON.stringify(payload),
    tags: [
      ['p', toPubkey],
      ['e', CHANNEL_ID],
      ['t', 'obelisk-voice-signal'],
    ],
  });
}

function createPeer(remotePubkey) {
  if (peers.has(remotePubkey)) return peers.get(remotePubkey);
  // Always be polite when our pubkey > theirs (lexicographic). Plus we
  // also be polite if remote turns out to be impolite by ordering — for
  // our test peer specifically we just always favor accepting their
  // offer to avoid deadlock with browser-side polite/impolite assumptions.
  const polite = myPubkey > remotePubkey;
  console.log('[mesh] open PC to', remotePubkey.slice(0, 8), 'polite=', polite);

  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    bundlePolicy: 'max-bundle',
    // Match the dex client's NEXT_PUBLIC_FORCE_RELAY=1: force TURN-only
    // candidates so we don't include unreachable docker-bridge host
    // IPs that the remote can't pair with through coturn.
    iceTransportPolicy: 'relay',
  });

  const sessionId = randomUUID().slice(0, 8);
  const state = { pc, makingOffer: false, sessionId, outboundSeq: 0, polite, remotePubkey };
  peers.set(remotePubkey, state);

  // Add tracks. Reuse the shared MediaStreamTrack instances so all PCs
  // share the same RTP pump (one ffmpeg encode for everyone).
  pc.addTransceiver('video', { direction: 'sendonly' }).sender.replaceTrack(sharedVideoTrack);
  pc.addTransceiver('audio', { direction: 'sendonly' }).sender.replaceTrack(sharedAudioTrack);

  // werift's onnegotiationneeded sometimes doesn't fire after
  // addTransceiver; kick the offer manually after a tick.
  setImmediate(async () => {
    if (state.makingOffer || pc.signalingState !== 'stable') return;
    try {
      state.makingOffer = true;
      console.log('[mesh] kicking initial offer to', remotePubkey.slice(0, 8));
      await pc.setLocalDescription();
      if (pc.localDescription) {
        await sendSignal(remotePubkey, {
          type: 'offer',
          sdp: pc.localDescription.sdp,
          sessionId,
          seq: ++state.outboundSeq,
        });
      }
    } catch (e) {
      console.warn('[mesh] kick offer threw', e.message);
    } finally {
      state.makingOffer = false;
    }
  });

  pc.onnegotiationneeded = async () => {
    if (state.makingOffer || pc.signalingState !== 'stable') return;
    try {
      state.makingOffer = true;
      await pc.setLocalDescription();
      if (pc.localDescription) {
        await sendSignal(remotePubkey, {
          type: 'offer',
          sdp: pc.localDescription.sdp,
          sessionId,
          seq: ++state.outboundSeq,
        });
      }
    } finally {
      state.makingOffer = false;
    }
  };

  pc.onIceCandidate.subscribe(async (candidate) => {
    if (!candidate) return;
    await sendSignal(remotePubkey, {
      type: 'ice',
      candidates: [candidate.toJSON()],
      sessionId,
      seq: ++state.outboundSeq,
    });
  });

  pc.connectionStateChange.subscribe((s) => {
    console.log('[mesh] PC →', remotePubkey.slice(0, 8), 'connectionState=', s);
    if (s === 'closed' || s === 'failed') peers.delete(remotePubkey);
  });

  // Trackinfo so the dex labels the inbound track.
  setImmediate(async () => {
    await sendSignal(remotePubkey, {
      type: 'trackinfo',
      trackInfo: { trackId: sharedVideoTrack.uuid, kind: 'camera' },
      sessionId,
      seq: ++state.outboundSeq,
    });
    await sendSignal(remotePubkey, {
      type: 'trackinfo',
      trackInfo: { trackId: sharedAudioTrack.uuid, kind: 'audio' },
      sessionId,
      seq: ++state.outboundSeq,
    });
  });

  return state;
}

async function handleSignal(fromPubkey, payload) {
  const state = createPeer(fromPubkey);
  const { pc } = state;
  try {
    if (payload.type === 'offer' && payload.sdp) {
      const offerCollision = state.makingOffer || pc.signalingState !== 'stable';
      if (offerCollision && pc.signalingState === 'have-local-offer') {
        try { await pc.setLocalDescription({ type: 'rollback' }); }
        catch (e) { console.warn('[mesh] rollback threw', e.message); }
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      await pc.setLocalDescription();
      if (pc.localDescription) {
        await sendSignal(fromPubkey, {
          type: 'answer',
          sdp: pc.localDescription.sdp,
          sessionId: state.sessionId,
          seq: ++state.outboundSeq,
        });
      }
    } else if (payload.type === 'answer' && payload.sdp) {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      }
    } else if (payload.type === 'ice' && Array.isArray(payload.candidates)) {
      for (const c of payload.candidates) {
        try { await pc.addIceCandidate(c); } catch { /* stale */ }
      }
    } else if (payload.type === 'requestReset') {
      // Polite restart on remote request — close + recreate.
      pc.close();
      peers.delete(fromPubkey);
    }
  } catch (err) {
    console.warn('[mesh] handleSignal threw', err.message);
  }
}

// ── Subscribe: kind 20078 (presence) + kind 25050 (signaling) ──────────
const seenSignals = new Set();
pool.subscribe(RELAYS, {
  kinds: [25050],
  '#e': [CHANNEL_ID],
  since: Math.floor(Date.now() / 1000) - 30,
}, {
  onevent: async (ev) => {
    if (seenSignals.has(ev.id)) return;
    seenSignals.add(ev.id);
    const targeted = ev.tags.some((t) => t[0] === 'p' && t[1] === myPubkey);
    if (!targeted) return;
    if (ev.pubkey === myPubkey) return;
    let payload; try { payload = JSON.parse(ev.content); } catch { return; }
    console.log('[mesh] ←', payload.type, 'from', ev.pubkey.slice(0, 8));
    await handleSignal(ev.pubkey, payload);
  },
});

const seenPubkeys = new Set();
pool.subscribe(RELAYS, {
  kinds: [20078],
  '#e': [CHANNEL_ID],
  since: Math.floor(Date.now() / 1000) - 60,
}, {
  onevent: (ev) => {
    if (ev.pubkey === myPubkey) return;
    // Skip beacons that are ours (also from prior runs). We only dial
    // peers we haven't seen yet so a re-published beacon doesn't open
    // a duplicate PC.
    if (seenPubkeys.has(ev.pubkey)) return;
    seenPubkeys.add(ev.pubkey);
    console.log('[mesh] roster sees', ev.pubkey.slice(0, 8), '— opening PC');
    createPeer(ev.pubkey);
  },
});

// ── Publish our own kind 20078 beacon ──────────────────────────────────
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

console.log('[mesh] running. Ctrl-C to stop.');

process.on('SIGINT', () => {
  console.log('[mesh] shutting down');
  ffv.kill(); ffa.kill();
  for (const { pc } of peers.values()) pc.close();
  pool.close(RELAYS);
  process.exit(0);
});
