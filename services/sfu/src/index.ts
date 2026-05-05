/**
 * Obelisk SFU entrypoint.
 *
 * Boot sequence:
 *   1. Load config + identity.
 *   2. Open relay pool, advertise (kind 31313).
 *   3. Start membership tracker, room manager, call-listener.
 *   4. Start HTTP server.
 *   5. Trap SIGINT/SIGTERM/SIGHUP/SIGUSR1.
 *
 * Shutdown sequence:
 *   1. Mark HTTP /healthz as 503.
 *   2. Close all rooms (publishes kind 31314 status=closed for each).
 *   3. Stop call-listener, advertiser, membership.
 *   4. Close relay pool.
 *   5. Close HTTP server.
 *   6. Exit.
 */
import { Advertiser } from './advertise.js';
import { CallListener } from './call-listener.js';
import { createIdentity } from './identity.js';
import { createLogger } from './log.js';
import { HttpServer } from './http-server.js';
import { MembershipTracker } from './membership.js';
import { RelayPool } from './relay.js';
import { RoomManager } from './room-manager.js';
import { createMediasoupEngine, type MediasoupEngine } from './mediasoup-server.js';
import { loadConfig, reloadAllowList, type Config } from './config.js';

const log = createLogger('main');

async function main(): Promise<void> {
  const bootedAt = Math.floor(Date.now() / 1000);
  const cfg: Config = loadConfig();
  const identity = createIdentity(cfg.nsecHex);

  log.info('boot', {
    pubkey: identity.pubkey,
    operator: cfg.operatorPubkey ?? '(self)',
    relays: cfg.relays.length,
    cap: cfg.maxParticipantsPerRoom,
  });

  const relay = new RelayPool(cfg.relays, identity);
  const membership = new MembershipTracker(relay);

  // mediasoup engine: only spun up when SFU_ENGINE=mediasoup. The werift
  // path keeps zero native dependencies for backward compat.
  let mediasoupEngine: MediasoupEngine | null = null;
  if (cfg.engine === 'mediasoup') {
    mediasoupEngine = await createMediasoupEngine(cfg);
  }

  const rooms = new RoomManager(cfg, relay, membership, mediasoupEngine);
  const advertiser = new Advertiser(cfg, relay);
  const listener = new CallListener(cfg, relay, rooms);
  const http = new HttpServer({
    cfg,
    sfuPubkey: identity.pubkey,
    rooms,
    bootedAt,
  });

  await advertiser.start();
  listener.start();
  await http.start();

  log.info('ready', {
    publicUrl: cfg.publicUrl ?? `http://127.0.0.1:${cfg.httpPort}`,
    pubkey: identity.pubkey,
  });

  // ── Signals ────────────────────────────────────────────────────────────

  let shuttingDown = false;
  async function shutdown(signal: string, exitCode: number): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutdown initiated', { signal });

    http.setShuttingDown();
    listener.stop();
    advertiser.stop();

    try {
      await rooms.closeAll();
    } catch (err) {
      log.warn('closeAll threw', { err: (err as Error).message });
    }

    try {
      await http.stop();
    } catch (err) {
      log.warn('http.stop threw', { err: (err as Error).message });
    }

    relay.close();
    if (mediasoupEngine) {
      try { await mediasoupEngine.close(); } catch (err) {
        log.warn('mediasoup engine close threw', { err: (err as Error).message });
      }
    }
    log.info('shutdown complete');
    // Give the event loop a tick to flush logs.
    setTimeout(() => process.exit(exitCode), 50);
  }

  process.on('SIGINT', () => void shutdown('SIGINT', 0));
  process.on('SIGTERM', () => void shutdown('SIGTERM', 0));
  process.on('uncaughtException', (err) => {
    log.error('uncaughtException', { err: err.message, stack: err.stack });
    void shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (err) => {
    log.error('unhandledRejection', {
      err: err instanceof Error ? err.message : String(err),
    });
  });

  // SIGHUP — reload allow-list + republish advertisement.
  process.on('SIGHUP', () => {
    log.info('SIGHUP — reloading allow-list');
    const { added, removed } = reloadAllowList(cfg);
    if (added > 0 || removed > 0) {
      void advertiser.republish().catch((err) =>
        log.warn('advertisement republish failed', { err: (err as Error).message }),
      );
    }
  });

  // SIGUSR1 — drain (stop accepting new rooms, let existing rooms finish).
  process.on('SIGUSR1', () => {
    log.info('SIGUSR1 — entering drain mode');
    rooms.setDraining();
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('boot failed:', err);
  process.exit(1);
});
