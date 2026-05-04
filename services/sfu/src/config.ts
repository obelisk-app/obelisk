/**
 * Env + file-based configuration. Read once at boot; the `Config` object
 * is treated as immutable thereafter except for `allowedPubkeys`, which
 * `auth.ts` can refresh on SIGHUP via `loadAllowList()`.
 *
 * All defaults match `.env.example`. See docs/sfu-system.md §8.
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { createLogger } from './log.js';
import type { Hex } from './types.js';

const log = createLogger('config');

export interface Config {
  /** SFU's signing key (hex secret). */
  nsecHex: Hex;
  /** Operator pubkey (hex). Defaults to the SFU's own pubkey when unset. */
  operatorPubkey: Hex | null;
  /** Pubkeys authorized to publish `start` events. Hot-swappable via SIGHUP. */
  allowedPubkeys: Set<Hex>;
  /** Relays the SFU subscribes/publishes to. */
  relays: string[];
  /**
   * Relays subscribed to ONLY for kind 25052 control events. Events seen
   * on these relays are treated as authorized — the relay's own write-
   * whitelist replaces the local allow.json for `start` events. The SFU
   * does NOT need to be whitelisted on these relays itself; only read
   * access is required.
   */
  trustedAuthorRelays: string[];
  /** Per-room participant ceiling. */
  maxParticipantsPerRoom: number;
  /** Concurrent room ceiling. */
  maxRooms: number;
  /** Drop empty rooms after this many seconds. */
  emptyGraceSeconds: number;
  /** HTTP server port (cloudflared targets this). */
  httpPort: number;
  /** Public IP override for ICE candidates (1:1 NAT). */
  publicIp: string | null;
  rtpPortMin: number;
  rtpPortMax: number;
  stunUrls: string[];
  turnUrls: string[];
  turnUsername: string | null;
  turnCredential: string | null;
  /** Public URL — advertised in kind 31313 `url` tag. */
  publicUrl: string | null;
  region: string | null;
  /** Path to the optional allow-list JSON file (relative to service root). */
  allowFilePath: string;
}

function envHex(name: string): Hex | null {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return null;
  if (!/^[0-9a-f]+$/i.test(raw)) {
    throw new Error(`${name} must be hex (0-9a-f), got "${raw.slice(0, 16)}…"`);
  }
  return raw.toLowerCase();
}

function envCsv(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`${name} must be an integer, got "${raw}"`);
  }
  return n;
}

function readAllowFile(path: string): Hex[] {
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as { pubkeys?: unknown };
    if (!Array.isArray(parsed.pubkeys)) {
      log.warn('allow.json missing pubkeys[] — ignoring', { path });
      return [];
    }
    return parsed.pubkeys
      .filter((x): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/i.test(x))
      .map((s) => s.toLowerCase());
  } catch (err) {
    log.warn('failed to parse allow.json — ignoring', {
      path,
      err: (err as Error).message,
    });
    return [];
  }
}

/**
 * Merge env CSV + allow.json into one set. Both sources are optional;
 * the union is what the SFU actually enforces.
 */
function loadAllowList(allowFilePath: string): Set<Hex> {
  const fromEnv = envCsv('SFU_ALLOWED_PUBKEYS')
    .filter((s) => /^[0-9a-f]{64}$/i.test(s))
    .map((s) => s.toLowerCase());
  const fromFile = readAllowFile(allowFilePath);
  return new Set([...fromEnv, ...fromFile]);
}

/**
 * Re-read `allow.json` and `SFU_ALLOWED_PUBKEYS` and patch the existing
 * config in place. Called on SIGHUP. Mutates the same Set so anything
 * holding a reference (auth.ts) sees the update without reload.
 */
export function reloadAllowList(cfg: Config): { added: number; removed: number } {
  const next = loadAllowList(cfg.allowFilePath);
  let added = 0;
  let removed = 0;
  for (const pk of next) if (!cfg.allowedPubkeys.has(pk)) added++;
  for (const pk of cfg.allowedPubkeys) if (!next.has(pk)) removed++;
  cfg.allowedPubkeys.clear();
  for (const pk of next) cfg.allowedPubkeys.add(pk);
  log.info('allow-list reloaded', { added, removed, total: cfg.allowedPubkeys.size });
  return { added, removed };
}

export function loadConfig(): Config {
  const nsecHex = envHex('SFU_NSEC');
  if (!nsecHex || nsecHex.length !== 64) {
    throw new Error(
      'SFU_NSEC must be a 64-char hex secret. Run `npm run generate-keys` to make one.',
    );
  }

  const allowFilePath = resolve(process.cwd(), 'allow.json');
  const allowedPubkeys = loadAllowList(allowFilePath);

  const relays = envCsv('SFU_RELAYS');
  if (relays.length === 0) {
    throw new Error('SFU_RELAYS must list at least one wss:// URL');
  }
  for (const url of relays) {
    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      throw new Error(`SFU_RELAYS contains non-ws URL: ${url}`);
    }
  }

  const trustedAuthorRelays = envCsv('SFU_TRUSTED_AUTHOR_RELAYS');
  for (const url of trustedAuthorRelays) {
    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      throw new Error(`SFU_TRUSTED_AUTHOR_RELAYS contains non-ws URL: ${url}`);
    }
  }

  const rtpPortMin = envInt('SFU_RTP_PORT_MIN', 40000);
  const rtpPortMax = envInt('SFU_RTP_PORT_MAX', 40099);
  if (rtpPortMax <= rtpPortMin) {
    throw new Error(`SFU_RTP_PORT_MAX (${rtpPortMax}) must be > SFU_RTP_PORT_MIN (${rtpPortMin})`);
  }

  const cfg: Config = {
    nsecHex,
    operatorPubkey: envHex('SFU_OPERATOR_PUBKEY'),
    allowedPubkeys,
    relays,
    trustedAuthorRelays,
    maxParticipantsPerRoom: envInt('SFU_MAX_PARTICIPANTS_PER_ROOM', 50),
    maxRooms: envInt('SFU_MAX_ROOMS', 10),
    emptyGraceSeconds: envInt('SFU_EMPTY_GRACE_SECONDS', 300),
    httpPort: envInt('SFU_HTTP_PORT', 4848),
    publicIp: (process.env.SFU_PUBLIC_IP ?? '').trim() || null,
    rtpPortMin,
    rtpPortMax,
    stunUrls: envCsv('SFU_STUN_URLS'),
    turnUrls: envCsv('SFU_TURN_URLS'),
    turnUsername: (process.env.SFU_TURN_USERNAME ?? '').trim() || null,
    turnCredential: (process.env.SFU_TURN_CREDENTIAL ?? '').trim() || null,
    publicUrl: (process.env.SFU_PUBLIC_URL ?? '').trim() || null,
    region: (process.env.SFU_REGION ?? '').trim() || null,
    allowFilePath,
  };

  log.info('config loaded', {
    relays: cfg.relays.length,
    trustedRelays: cfg.trustedAuthorRelays.length,
    allowed: cfg.allowedPubkeys.size,
    maxRooms: cfg.maxRooms,
    cap: cfg.maxParticipantsPerRoom,
    httpPort: cfg.httpPort,
    publicUrl: cfg.publicUrl ?? '(unset)',
  });

  return cfg;
}
