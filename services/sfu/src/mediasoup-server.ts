/**
 * mediasoup engine bootstrap.
 *
 * Spins up N worker processes (one per CPU core by default) and offers
 * lazy `getRouter(channelId)` allocation. Routers are pinned to a single
 * worker for the lifetime of the channel — workers can't share state, so
 * a single channel must live entirely inside one worker.
 *
 * The actual Nostr-RPC plumbing lives in `room-mediasoup.ts` / `nostr-rpc.ts`;
 * this file is engine-only.
 */
import { cpus } from 'node:os';
import { createWorker, types as ms } from 'mediasoup';

import { createLogger } from './log.js';
import type { Config } from './config.js';

const log = createLogger('mediasoup');

/**
 * Codec capabilities advertised to clients via `getRouterRtpCapabilities`.
 * Order matters — clients prefer the first usable codec. We list opus
 * (audio) and VP8 first; VP9/H264 included for browser compatibility but
 * VP8 is the default video codec for our forwarding path because every
 * browser + every werift-era test peer encodes it natively.
 */
// Codec list advertised to clients via getRouterRtpCapabilities. Kept
// minimal (opus + VP8) for v1 — every browser supports these without
// complex parameter negotiation. VP9/H264 can come back once we've
// verified the basic pipeline; their `parameters` blocks are validation
// hot spots in mediasoup-worker (string vs number coercion bugs that
// silently hang the createRouter call instead of erroring).
const ROUTER_MEDIA_CODECS: ms.RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    preferredPayloadType: 100,
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    preferredPayloadType: 101,
    clockRate: 90000,
    parameters: { 'x-google-start-bitrate': 1000 },
  },
];

export interface MediasoupEngine {
  /** Lazily get-or-create a router for a channel. Pinned to one worker. */
  getRouter(channelId: string): Promise<ms.Router>;
  /** Drop the router for a channel — call when the room closes. */
  closeRouter(channelId: string): Promise<void>;
  /** Codec list for `device.load()` on the client side. */
  routerRtpCapabilities(channelId: string): Promise<ms.RtpCapabilities>;
  /** Build options for `router.createWebRtcTransport`. */
  webRtcTransportOptions(): ms.WebRtcTransportOptions;
  /** Shut every worker down. */
  close(): Promise<void>;
}

interface InternalState {
  workers: ms.Worker[];
  /** channelId → Router (and which worker hosts it, for cleanup ordering). */
  routers: Map<string, { router: ms.Router; worker: ms.Worker }>;
  /** Round-robin index for new router allocations. */
  nextWorker: number;
  cfg: Config;
}

export async function createMediasoupEngine(cfg: Config): Promise<MediasoupEngine> {
  const numWorkers = Math.max(1, cpus().length);
  log.info('booting mediasoup workers', { count: numWorkers });

  const workers: ms.Worker[] = [];
  for (let i = 0; i < numWorkers; i++) {
    const worker = await createWorker({
      logLevel: 'warn',
      // ICE port range for WebRTC transports — pin to the same band as the
      // werift SFU so existing firewall pinholes keep working.
      rtcMinPort: cfg.rtpPortMin,
      rtcMaxPort: cfg.rtpPortMax,
    });
    worker.on('died', (err) => {
      log.error('mediasoup worker died — process will exit', {
        pid: worker.pid,
        err: err.message,
      });
      // A dead worker can't recover; bail and let pm2 restart us so all
      // routers/transports rebuild cleanly. Silently leaking would manifest
      // as ghost rooms with no media flow.
      setTimeout(() => process.exit(1), 100);
    });
    workers.push(worker);
    log.info('mediasoup worker up', { pid: worker.pid, idx: i });
  }

  const state: InternalState = {
    workers,
    routers: new Map(),
    nextWorker: 0,
    cfg,
  };

  async function getRouter(channelId: string): Promise<ms.Router> {
    log.info('getRouter enter', { channelId: channelId.slice(0, 8), routers: state.routers.size });
    const existing = state.routers.get(channelId);
    if (existing) return existing.router;
    const worker = state.workers[state.nextWorker]!;
    state.nextWorker = (state.nextWorker + 1) % state.workers.length;
    log.info('getRouter calling worker.createRouter', {
      channelId: channelId.slice(0, 8), workerPid: worker.pid,
    });
    let router: ms.Router;
    try {
      router = await worker.createRouter({ mediaCodecs: ROUTER_MEDIA_CODECS });
    } catch (err) {
      log.error('worker.createRouter threw', {
        channelId: channelId.slice(0, 8),
        err: (err as Error).message,
        stack: (err as Error).stack,
      });
      throw err;
    }
    state.routers.set(channelId, { router, worker });
    log.info('router created', {
      channelId: channelId.slice(0, 8),
      workerPid: worker.pid,
      routerId: router.id,
    });
    return router;
  }

  return {
    getRouter,

    async closeRouter(channelId: string): Promise<void> {
      const entry = state.routers.get(channelId);
      if (!entry) return;
      state.routers.delete(channelId);
      try {
        entry.router.close();
        log.info('router closed', { channelId: channelId.slice(0, 8) });
      } catch (err) {
        log.warn('router close threw', { err: (err as Error).message });
      }
    },

    async routerRtpCapabilities(channelId: string): Promise<ms.RtpCapabilities> {
      const router = await getRouter(channelId);
      return router.rtpCapabilities;
    },

    webRtcTransportOptions(): ms.WebRtcTransportOptions {
      const listenIp: ms.TransportListenIp = cfg.publicIp
        ? { ip: '0.0.0.0', announcedIp: cfg.publicIp }
        : { ip: '0.0.0.0' };
      return {
        listenIps: [listenIp],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
        // initialAvailableOutgoingBitrate kicks transport-cc; mediasoup will
        // ramp up as the link allows. 1 Mbps is a safe starting point for
        // a single 720p video stream — most browsers raise from there.
        initialAvailableOutgoingBitrate: 1_000_000,
      };
    },

    async close(): Promise<void> {
      for (const [channelId, entry] of state.routers) {
        try { entry.router.close(); } catch { /* ignore */ }
        log.debug('router closed (engine shutdown)', { channelId: channelId.slice(0, 8) });
      }
      state.routers.clear();
      for (const worker of state.workers) {
        try { worker.close(); } catch { /* ignore */ }
      }
      log.info('mediasoup engine closed');
    },
  };
}
